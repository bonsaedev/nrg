import type { Plugin } from "vite";
import dts from "vite-plugin-dts";
import fs from "fs";
import path from "path";
import ts from "typescript";

/**
 * Recursively collect all .ts files under a directory, excluding .d.ts files.
 */
function collectTsFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((dirent) => {
    const full = path.join(dir, dirent.name);
    if (dirent.isDirectory()) return collectTsFiles(full);
    if (
      dirent.isFile() &&
      dirent.name.endsWith(".ts") &&
      !dirent.name.endsWith(".d.ts")
    )
      return [full];
    return [];
  });
}

/**
 * Convert a file basename (without extension) to PascalCase.
 * E.g. "your-node" → "YourNode", "remote_server" → "RemoteServer"
 */
function toPascalCase(name: string): string {
  return name
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

/**
 * Positional semantic names for each framework base class.
 * Position i in the generic corresponds to the i-th semantic slot.
 * Users can name their types anything — the position determines meaning.
 */
const BASE_CLASS_SLOTS: Record<string, string[]> = {
  IONode: ["Config", "Credentials", "Input", "Output", "Settings"],
  ConfigNode: ["Config", "Credentials", "Settings"],
};

/**
 * Parse a node source file and return `{ localName, semanticName }` pairs for
 * types that should be exported from the package.
 *
 * The semantic name is derived from the generic POSITION in the base class, so
 * a user can name their types anything:
 *
 *   export default class MyNode extends IONode<Bananas, MyCreds, …>
 *   export type Bananas = { … }   → exported as {Ns}Config  (position 0)
 *   export type MyCreds = { … }   → exported as {Ns}Credentials (position 1)
 *
 * Only types that appear as generic args AND are exported from the file are
 * included, so unrelated helper types are never leaked.
 */
function getNodeTypeExports(
  filePath: string,
): Array<{ localName: string; semanticName: string }> {
  const content = fs.readFileSync(filePath, "utf-8");
  const source = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.ESNext,
    /* setParentNodes */ true,
  );

  const hasModifier = (node: ts.HasModifiers, kind: ts.SyntaxKind) =>
    (node.modifiers ?? []).some((m) => m.kind === kind);

  // Collect names of exported type aliases and interfaces.
  const exportedTypeNames = new Set<string>();
  for (const stmt of source.statements) {
    if (
      ts.isTypeAliasDeclaration(stmt) &&
      hasModifier(stmt, ts.SyntaxKind.ExportKeyword)
    ) {
      exportedTypeNames.add(stmt.name.text);
    }
    if (
      ts.isInterfaceDeclaration(stmt) &&
      hasModifier(stmt, ts.SyntaxKind.ExportKeyword)
    ) {
      exportedTypeNames.add(stmt.name.text);
    }
  }

  if (exportedTypeNames.size === 0) return [];

  // Find `export default class … extends BaseClass<T0, T1, …>` and extract
  // the base class name and its generic type argument names by position.
  let baseClassName = "";
  const genericArgNames: string[] = [];

  for (const stmt of source.statements) {
    if (
      !ts.isClassDeclaration(stmt) ||
      !hasModifier(stmt, ts.SyntaxKind.DefaultKeyword)
    ) {
      continue;
    }
    for (const clause of stmt.heritageClauses ?? []) {
      if (clause.token !== ts.SyntaxKind.ExtendsKeyword) continue;
      for (const type of clause.types) {
        if (ts.isIdentifier(type.expression)) {
          baseClassName = type.expression.text;
        }
        for (const arg of type.typeArguments ?? []) {
          if (ts.isTypeReferenceNode(arg) && ts.isIdentifier(arg.typeName)) {
            genericArgNames.push(arg.typeName.text);
          } else {
            // Unknown / complex type arg — push empty string to preserve positions.
            genericArgNames.push("");
          }
        }
      }
    }
    break;
  }

  const slots = BASE_CLASS_SLOTS[baseClassName];
  if (!slots) return [];

  // Build pairs: for each position, if the arg is exported AND we have a
  // semantic name for that slot, include it.
  const result: Array<{ localName: string; semanticName: string }> = [];
  for (let i = 0; i < genericArgNames.length; i++) {
    const localName = genericArgNames[i];
    const semanticName = slots[i];
    if (localName && semanticName && exportedTypeNames.has(localName)) {
      result.push({ localName, semanticName });
    }
  }
  return result;
}

/**
 * Build re-export statements for every file in {srcDir}/nodes/, relative to
 * the given entry file path.
 *
 * Per node file two kinds of statements are generated:
 *
 *   // 1. Class re-export — so api-extractor includes the class declaration
 *   //    in the bundled .d.ts, enabling `import { YourNode }`, `instanceof`,
 *   //    type assertions `as YourNode`, and `resolveTypedInput<YourNode>()`.
 *   export { default as YourNode } from "./nodes/your-node";
 *
 *   // 2. Type-only exports — one per exported type alias/interface, prefixed
 *   //    with the namespace name to avoid collisions across node files.
 *   //    Enables `import type { YourNodeConfig, YourNodeCredentials }`.
 *   export type { Config as YourNodeConfig, Credentials as YourNodeCredentials,
 *                 Input as YourNodeInput, Output as YourNodeOutput,
 *                 Settings as YourNodeSettings } from "./nodes/your-node";
 *
 * These statements are appended in memory to the entry file content served to
 * the TypeScript compiler via a `ts.sys.readFile` patch, so api-extractor
 * includes them in the final bundled `.d.ts` without touching any source file.
 * Runtime class values are exposed by `cjsDefaultExportPlugin` dynamically
 * via the `nodes` array on the package function.
 */
/**
 * Semantic names for schema properties in both class static properties
 * and factory definition objects.
 */
const SCHEMA_PROP_SEMANTICS: Record<string, string> = {
  configSchema: "ConfigSchema",
  credentialsSchema: "CredentialsSchema",
  inputSchema: "InputSchema",
  outputsSchema: "OutputsSchema",
  settingsSchema: "SettingsSchema",
};

/**
 * Extract schema references from a node file — works for both class-based
 * and factory-based (defineIONode/defineConfigNode) patterns.
 *
 * Returns an array of { localName, semanticName, importSource } where:
 * - localName: the identifier used in the file (e.g., "ConfigsSchema")
 * - semanticName: the semantic slot name (e.g., "ConfigSchema")
 * - importSource: the relative import path (e.g., "../schemas/my-node")
 */
function getSchemaReferences(
  filePath: string,
): Array<{ localName: string; semanticName: string; importSource: string }> {
  const content = fs.readFileSync(filePath, "utf-8");
  const source = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.ESNext,
    true,
  );

  // Build a map of imported identifiers → their source module
  const importMap = new Map<string, string>();
  for (const stmt of source.statements) {
    if (ts.isImportDeclaration(stmt) && stmt.importClause) {
      const moduleSpecifier = (stmt.moduleSpecifier as ts.StringLiteral).text;
      const namedBindings = stmt.importClause.namedBindings;
      if (namedBindings && ts.isNamedImports(namedBindings)) {
        for (const el of namedBindings.elements) {
          importMap.set(el.name.text, moduleSpecifier);
        }
      }
    }
  }

  // Collect schema property assignments: { propName → identifiers[] }
  const schemaRefs = new Map<string, string[]>();

  // Extract identifier(s) from an initializer — handles both single identifiers
  // and array literals like [Output1Schema, Output2Schema].
  function extractIdentifiers(node: ts.Expression): string[] {
    if (ts.isIdentifier(node)) return [node.text];
    if (ts.isArrayLiteralExpression(node)) {
      return node.elements.filter(ts.isIdentifier).map((el) => el.text);
    }
    return [];
  }

  for (const stmt of source.statements) {
    // Class-based: static readonly configSchema = ConfigsSchema
    //              static readonly outputsSchema = [Output1Schema, Output2Schema]
    if (ts.isClassDeclaration(stmt)) {
      for (const member of stmt.members) {
        if (
          ts.isPropertyDeclaration(member) &&
          ts.isIdentifier(member.name) &&
          member.name.text in SCHEMA_PROP_SEMANTICS &&
          member.initializer
        ) {
          const ids = extractIdentifiers(member.initializer);
          if (ids.length > 0) {
            schemaRefs.set(member.name.text, ids);
          }
        }
      }
    }

    // Factory-based: export default defineIONode({ configSchema: X, ... })
    if (
      ts.isExportAssignment(stmt) &&
      stmt.expression &&
      ts.isCallExpression(stmt.expression)
    ) {
      const callee = stmt.expression.expression;
      if (
        ts.isIdentifier(callee) &&
        (callee.text === "defineIONode" || callee.text === "defineConfigNode")
      ) {
        const arg = stmt.expression.arguments[0];
        if (arg && ts.isObjectLiteralExpression(arg)) {
          for (const prop of arg.properties) {
            if (
              ts.isPropertyAssignment(prop) &&
              ts.isIdentifier(prop.name) &&
              prop.name.text in SCHEMA_PROP_SEMANTICS
            ) {
              const ids = extractIdentifiers(prop.initializer);
              if (ids.length > 0) {
                schemaRefs.set(prop.name.text, ids);
              }
            }
          }
        }
      }
    }
  }

  // Build result: match schema references to their import sources
  const result: Array<{
    localName: string;
    semanticName: string;
    importSource: string;
    tupleProp?: string;
  }> = [];
  for (const [propName, identifiers] of schemaRefs) {
    const semanticName = SCHEMA_PROP_SEMANTICS[propName];
    const isArray = identifiers.length > 1;
    for (const identifier of identifiers) {
      const importSource = importMap.get(identifier);
      if (importSource) {
        result.push({
          localName: identifier,
          semanticName: isArray ? identifier : semanticName,
          importSource,
          tupleProp: isArray ? semanticName : undefined,
        });
      }
    }
  }
  return result;
}

function buildNodeReexports(srcDir: string, entryFile: string): string {
  const nodesDir = path.join(srcDir, "nodes");
  const nodeFiles = collectTsFiles(nodesDir);
  return nodeFiles
    .map((file) => {
      const rel = path
        .relative(path.dirname(entryFile), file)
        .replace(/\\/g, "/");
      const relPath = rel.startsWith(".") ? rel : `./${rel}`;
      const specifier = relPath.replace(/\.ts$/, "");
      const ns = toPascalCase(path.basename(file, ".ts"));

      const lines = [`export { default as ${ns} } from "${specifier}";`];

      // Re-export type aliases from the node file (class-based nodes)
      const typePairs = getNodeTypeExports(file);
      if (typePairs.length > 0) {
        const prefixed = typePairs
          .map(
            ({ localName, semanticName }) =>
              `${localName} as ${ns}${semanticName}`,
          )
          .join(", ");
        lines.push(`export type { ${prefixed} } from "${specifier}";`);
      }

      // Re-export schemas referenced by the node definition (class or factory)
      const schemaRefs = getSchemaReferences(file);
      // Group by import source for cleaner re-exports
      const bySource = new Map<string, string[]>();
      for (const ref of schemaRefs) {
        const resolvedSource = path
          .relative(
            path.dirname(entryFile),
            path.resolve(path.dirname(file), ref.importSource),
          )
          .replace(/\\/g, "/");
        const sourceSpecifier = resolvedSource.startsWith(".")
          ? resolvedSource
          : `./${resolvedSource}`;
        if (!bySource.has(sourceSpecifier)) bySource.set(sourceSpecifier, []);
        bySource
          .get(sourceSpecifier)!
          .push(`${ref.localName} as ${ns}${ref.semanticName}`);
      }
      for (const [source, names] of bySource) {
        lines.push(`export { ${names.join(", ")} } from "${source}";`);
      }

      return lines.join("\n");
    })
    .join("\n");
}

function typeGenerator(options: {
  srcDir: string;
  outDir: string;
  /** Absolute paths of entry files (values from the entryPoints record). */
  entryFiles: string[];
}): Plugin[] {
  const { srcDir, outDir, entryFiles } = options;

  // Prefer the server-specific tsconfig (inside srcDir) over the root one.
  // The root tsconfig typically only includes vite.config.ts, while the server
  // tsconfig includes the actual source files needed for declaration emit.
  const serverTsconfig = path.resolve(srcDir, "tsconfig.json");
  const rootTsconfig = path.resolve("tsconfig.json");
  const userTsconfig = fs.existsSync(serverTsconfig)
    ? serverTsconfig
    : rootTsconfig;
  // Exclude the user's client dir (sibling of srcDir), any nested client dirs,
  // and the vite/ build-tooling dir — none of these should appear in the
  // published type declarations.
  const clientDir = path.relative(
    process.cwd(),
    path.join(path.dirname(srcDir), "client"),
  );

  // Absolute resolved path → augmented source content (in-memory only).
  const augmentedContents = new Map<string, string>();
  // Original ts.sys.readFile — restored in closeBundle.
  let origReadFile: typeof ts.sys.readFile | null = null;

  const nodeTypeExporter: Plugin = {
    name: "vite-plugin-node-red:server:type-exporter",
    enforce: "pre",
    buildStart() {
      augmentedContents.clear();
      for (const entryFile of entryFiles) {
        const reexports = buildNodeReexports(srcDir, entryFile);
        if (!reexports) continue;
        const original = fs.readFileSync(entryFile, "utf-8");
        augmentedContents.set(
          path.resolve(entryFile),
          `${original}\n${reexports}\n`,
        );
      }
      if (augmentedContents.size === 0) return;
      origReadFile = ts.sys.readFile.bind(ts.sys);
      ts.sys.readFile = (fileName, encoding) => {
        const resolved = path.resolve(fileName);
        return (
          augmentedContents.get(resolved) ?? origReadFile!(fileName, encoding)
        );
      };
    },
    closeBundle() {
      if (origReadFile) {
        ts.sys.readFile = origReadFile;
        origReadFile = null;
      }
      augmentedContents.clear();
    },
  };

  return [
    nodeTypeExporter,
    dts({
      rollupTypes: true,
      rollupOptions: {
        messageCallback(message) {
          if (message.messageId === "console-preamble") {
            message.logLevel = "none";
          }
        },
      },
      outDir,
      ...(fs.existsSync(userTsconfig) && { tsconfigPath: userTsconfig }),
      compilerOptions: {
        noEmit: false,
        declaration: true,
        emitDeclarationOnly: true,
        noCheck: true,
      },
      exclude: [
        `${clientDir}/**`,
        "**/client/**",
        "vite/**",
        "node_modules/**",
        "dist/**",
      ],
    }),
  ].flat();
}

export { typeGenerator };
