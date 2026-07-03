import ts from "typescript";
import fs from "fs";
import path from "path";
import { nodeTypesPath } from "../../utils";

/**
 * Build-time extraction of a node's TypeScript types — the SOURCE OF TRUTH for
 * help docs. Schemas are optional (validation only); a node is fully described
 * by the types it declares on its class, so we read those with a real
 * `ts.TypeChecker` rather than the serialized schema:
 *
 *   class MyNode extends IONode<Config, Credentials, Input, Output, Settings> {
 *     async input(msg: Input) { return { done: true }; } // → complete port type
 *   }
 *
 * Positional generics map to semantic roles (a user may name the types
 * anything); the `input()` return type (Promise-unwrapped) is the value the
 * built-in **complete** port carries.
 */

/** Position → semantic role for each framework base class. */
const BASE_CLASS_SLOTS: Record<string, string[]> = {
  IONode: ["config", "credentials", "input", "output", "settings"],
  ConfigNode: ["config", "credentials", "settings"],
  Node: ["config", "credentials", "settings"],
};

/** Roles that only exist on message-processing (IONode) nodes. */
const IO_ONLY_ROLES = new Set(["input", "output"]);

const RENDER_FLAGS =
  ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.WriteArrayAsGenericType;

interface NodeFieldInfo {
  name: string;
  type: string;
  optional: boolean;
}

interface NodeRoleType {
  /** The whole role type, rendered (e.g. `{ name: string }`, `"A" | "B"`). */
  text: string;
  /** Object members, when the role is an object type — otherwise empty. */
  fields: NodeFieldInfo[];
}

interface NodeOutputPort {
  /** Named-port name; omitted for positional ports. */
  name?: string;
  /** Display index (0-based, in declaration order). */
  index: number;
  /** The message type this port carries. */
  role: NodeRoleType;
}

interface NodeTypeInfo {
  type: string;
  kind: "io" | "config";
  config?: NodeRoleType;
  credentials?: NodeRoleType;
  input?: NodeRoleType;
  settings?: NodeRoleType;
  /**
   * Output ports, shape-aware: a single object output → one port; a positional
   * tuple → one port per element; a named-port record → one port per name.
   */
  outputs?: NodeOutputPort[];
  /** The `input()` return type — what the built-in complete port carries. */
  complete?: NodeRoleType;
}

/** Recursively list every `.ts` file under a directory (skips node_modules). */
function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectTsFiles(full));
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Create a `ts.Program` over a consumer's server source, honoring their
 * tsconfig's compilerOptions (needed so `@bonsae/nrg/server` and NodeRef/config
 * imports resolve). The node source files are always used as roots so a
 * type-only tsconfig `include` never drops them.
 */
function createNodeTypesProgram(
  srcDir: string,
  tsconfigPath?: string,
): ts.Program {
  const configPath =
    tsconfigPath ??
    [path.resolve(srcDir, "tsconfig.json"), path.resolve("tsconfig.json")].find(
      (p) => fs.existsSync(p),
    );

  let options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
  };

  if (configPath && fs.existsSync(configPath)) {
    const read = ts.readConfigFile(configPath, ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(
      read.config ?? {},
      ts.sys,
      path.dirname(configPath),
    );
    // Keep resolution-relevant options; force noEmit (we only type-check).
    options = { ...options, ...parsed.options, noEmit: true };
  }

  return ts.createProgram({ rootNames: collectTsFiles(srcDir), options });
}

/** Unwrap `Promise<T>` → `T` (leaves non-promises untouched). */
function unwrapPromise(type: ts.Type): ts.Type {
  if (type.getSymbol()?.getName() === "Promise") {
    const args = (type as ts.TypeReference).typeArguments;
    if (args && args.length > 0) return args[0];
  }
  return type;
}

/** True for types that carry no useful documentation (any/unknown/void/…). */
function isVacuous(checker: ts.TypeChecker, type: ts.Type): boolean {
  const text = checker.typeToString(type);
  return (
    text === "any" ||
    text === "unknown" ||
    text === "never" ||
    text === "void" ||
    text === "undefined" ||
    (type.flags & ts.TypeFlags.Any) !== 0 ||
    (type.flags & ts.TypeFlags.Unknown) !== 0 ||
    (type.flags & ts.TypeFlags.Void) !== 0
  );
}

// Only genuine object/intersection types have documentable members. Primitives,
// literals, and unions would otherwise leak JS prototype methods (charAt, …) via
// getPropertiesOfType — the help table would render dozens of bogus rows.
const DOCUMENTABLE_FIELDS = ts.TypeFlags.Object | ts.TypeFlags.Intersection;

/** The readable name of a type, resolving a `default` export to its own name. */
function typeDisplayName(type: ts.Type): string | undefined {
  const sym = type.aliasSymbol ?? type.getSymbol();
  const raw = sym?.getName();
  if (raw && raw !== "default") return raw;
  const decl = sym?.declarations?.[0];
  if (
    decl &&
    (ts.isClassDeclaration(decl) ||
      ts.isFunctionDeclaration(decl) ||
      ts.isInterfaceDeclaration(decl)) &&
    decl.name
  ) {
    return decl.name.text;
  }
  return undefined;
}

/**
 * `checker.typeToString` renders a default-exported (or otherwise
 * unaddressable) type as `import("<abs path>").default<…>` — strip the build
 * machine's path and use the type's declared name (e.g. `TypedInput<string>`).
 */
function render(checker: ts.TypeChecker, type: ts.Type, at: ts.Node): string {
  const text = checker.typeToString(type, at, RENDER_FLAGS);
  if (!text.includes('import("')) return text;
  const name = typeDisplayName(type);
  return (
    name ? text.replace(/import\("[^"]*"\)\.default/g, name) : text
  ).replace(/import\("[^"]*"\)\./g, "");
}

/** Object members of a type (empty for primitives/literals/unions). */
function objectFields(
  checker: ts.TypeChecker,
  type: ts.Type,
  at: ts.Node,
): NodeFieldInfo[] {
  if ((type.flags & DOCUMENTABLE_FIELDS) === 0) return [];
  const fields: NodeFieldInfo[] = [];
  for (const prop of checker.getPropertiesOfType(type)) {
    const optional = (prop.getFlags() & ts.SymbolFlags.Optional) !== 0;
    let propType = checker.getTypeOfSymbolAtLocation(prop, at);
    // Optionality is carried by the `optional` flag — don't also append
    // `| undefined` to the rendered type.
    if (optional) propType = checker.getNonNullableType(propType);
    fields.push({
      name: prop.getName(),
      type: render(checker, propType, at),
      optional,
    });
  }
  return fields;
}

/** Render one role type — or `undefined` when it carries nothing to document. */
function renderRole(
  checker: ts.TypeChecker,
  type: ts.Type,
  at: ts.Node,
): NodeRoleType | undefined {
  if (isVacuous(checker, type)) return undefined;
  return {
    text: render(checker, type, at),
    fields: objectFields(checker, type, at),
  };
}

/** The brand property nrg stamps on a named-port output type (see schemas/types). */
const NAMED_PORTS_BRAND = "__nrg_named_ports";

/** True when a type is a tuple (positional multi-output). */
function isTupleType(checker: ts.TypeChecker, type: ts.Type): boolean {
  return typeof checker.isTupleType === "function" && checker.isTupleType(type);
}

/**
 * Resolve an `Output` type to its ports, shape-aware:
 * - positional tuple `[A, B]` → one port per element;
 * - named-port record `{ success, failure } & NamedPortsBrand` → one per name
 *   (the brand property is dropped);
 * - a single object → one port.
 * Returns `undefined` when the output carries nothing to document (any/void).
 */
function extractOutputs(
  checker: ts.TypeChecker,
  outputType: ts.Type,
  at: ts.Node,
): NodeOutputPort[] | undefined {
  if (isVacuous(checker, outputType)) return undefined;

  const portRole = (type: ts.Type): NodeRoleType =>
    renderRole(checker, type, at) ?? {
      text: render(checker, type, at),
      fields: [],
    };

  if (isTupleType(checker, outputType)) {
    const elems = (outputType as ts.TypeReference).typeArguments ?? [];
    return elems.map((el, index) => ({ index, role: portRole(el) }));
  }

  if (checker.getPropertyOfType(outputType, NAMED_PORTS_BRAND)) {
    return checker
      .getPropertiesOfType(outputType)
      .filter((p) => p.getName() !== NAMED_PORTS_BRAND)
      .map((p, index) => ({
        name: p.getName(),
        index,
        role: portRole(checker.getTypeOfSymbolAtLocation(p, at)),
      }));
  }

  return [{ index: 0, role: portRole(outputType) }];
}

/** Walk base types (BFS) to the first IONode/ConfigNode/Node instantiation. */
function findFrameworkBase(
  checker: ts.TypeChecker,
  instanceType: ts.InterfaceType,
): { baseName: string; typeArgs: readonly ts.Type[] } | undefined {
  const queue: ts.Type[] = [...checker.getBaseTypes(instanceType)];
  const seen = new Set<ts.Type>();
  while (queue.length) {
    const base = queue.shift()!;
    if (seen.has(base)) continue;
    seen.add(base);
    const name = base.getSymbol()?.getName();
    if (name && BASE_CLASS_SLOTS[name]) {
      return {
        baseName: name,
        typeArgs: (base as ts.TypeReference).typeArguments ?? [],
      };
    }
    const baseTarget = (base as ts.TypeReference).target ?? base;
    if ((baseTarget as ts.InterfaceType).symbol) {
      queue.push(...checker.getBaseTypes(baseTarget as ts.InterfaceType));
    }
  }
  return undefined;
}

/** Unwrap `"x" as const` / `("x")` down to the string literal, if any. */
function stringLiteralOf(expr: ts.Expression): string | undefined {
  let e = expr;
  while (ts.isAsExpression(e) || ts.isParenthesizedExpression(e)) {
    e = e.expression;
  }
  return ts.isStringLiteral(e) ? e.text : undefined;
}

/** Read a class's `static readonly type = "..."` string literal, if present. */
function readStaticType(classDecl: ts.ClassDeclaration): string | undefined {
  for (const member of classDecl.members) {
    if (
      ts.isPropertyDeclaration(member) &&
      ts.isIdentifier(member.name) &&
      member.name.text === "type" &&
      member.initializer
    ) {
      const value = stringLiteralOf(member.initializer);
      if (value !== undefined) return value;
    }
  }
  return undefined;
}

/**
 * The default-export class declaration in a source file, if any. Handles all
 * three forms: `export default class X {}`, `export default X;`, and
 * `export { X as default }`.
 */
function defaultExportClass(
  sourceFile: ts.SourceFile,
): ts.ClassDeclaration | undefined {
  const classByName = (name: string): ts.ClassDeclaration | undefined =>
    sourceFile.statements.find(
      (s): s is ts.ClassDeclaration =>
        ts.isClassDeclaration(s) && s.name?.text === name,
    );

  let referencedName: string | undefined;

  for (const stmt of sourceFile.statements) {
    // 1) export default class X {}
    if (
      ts.isClassDeclaration(stmt) &&
      (stmt.modifiers ?? []).some(
        (m) => m.kind === ts.SyntaxKind.DefaultKeyword,
      )
    ) {
      return stmt;
    }
    // 2) export default X;
    if (
      ts.isExportAssignment(stmt) &&
      !stmt.isExportEquals &&
      ts.isIdentifier(stmt.expression)
    ) {
      referencedName = stmt.expression.text;
    }
    // 3) export { X as default }
    if (
      ts.isExportDeclaration(stmt) &&
      stmt.exportClause &&
      ts.isNamedExports(stmt.exportClause)
    ) {
      for (const spec of stmt.exportClause.elements) {
        if (spec.name.text === "default") {
          referencedName = (spec.propertyName ?? spec.name).text;
        }
      }
    }
  }

  return referencedName ? classByName(referencedName) : undefined;
}

/** Extract type info for one class-API node, or `undefined` if not a node. */
function extractClassNode(
  checker: ts.TypeChecker,
  classDecl: ts.ClassDeclaration,
): NodeTypeInfo | undefined {
  const symbol = classDecl.name && checker.getSymbolAtLocation(classDecl.name);
  if (!symbol) return undefined;
  const instanceType = checker.getDeclaredTypeOfSymbol(
    symbol,
  ) as ts.InterfaceType;
  const base = findFrameworkBase(checker, instanceType);
  if (!base) return undefined;

  const type = readStaticType(classDecl);
  if (!type) return undefined;

  const slots = BASE_CLASS_SLOTS[base.baseName];
  const kind: "io" | "config" = base.baseName === "IONode" ? "io" : "config";
  const info: NodeTypeInfo = { type, kind };

  base.typeArgs.forEach((argType, i) => {
    const role = slots[i];
    if (!role) return;
    if (kind === "config" && IO_ONLY_ROLES.has(role)) return;
    if (role === "output") {
      const ports = extractOutputs(checker, argType, classDecl);
      if (ports?.length) info.outputs = ports;
      return;
    }
    const rendered = renderRole(checker, argType, classDecl);
    if (rendered) {
      (info as unknown as Record<string, NodeRoleType>)[role] = rendered;
    }
  });

  if (kind === "io") {
    const inputSym = checker.getPropertyOfType(instanceType, "input");
    if (inputSym) {
      const inputType = checker.getTypeOfSymbolAtLocation(inputSym, classDecl);
      const sig = inputType.getCallSignatures()[0];
      if (sig) {
        const ret = unwrapPromise(sig.getReturnType());
        const rendered = renderRole(checker, ret, classDecl);
        if (rendered) info.complete = rendered;
      }
    }
  }

  return info;
}

/**
 * Extract every node's TypeScript type info from a program. Class-API nodes
 * (`export default class … extends IONode/ConfigNode`) are read from the
 * resolved base-type instantiation and the `input()` return type.
 */
function extractNodeTypes(program: ts.Program, srcDir: string): NodeTypeInfo[] {
  const checker = program.getTypeChecker();
  const root = path.resolve(srcDir);
  const out: NodeTypeInfo[] = [];

  for (const sourceFile of program.getSourceFiles()) {
    if (sourceFile.isDeclarationFile) continue;
    if (!path.resolve(sourceFile.fileName).startsWith(root)) continue;

    const classDecl = defaultExportClass(sourceFile);
    if (!classDecl) continue;
    const info = extractClassNode(checker, classDecl);
    if (info) out.push(info);
  }

  return out;
}

/** Convenience: create the program and extract in one call. */
function extractNodeTypesFromSrc(
  srcDir: string,
  tsconfigPath?: string,
): NodeTypeInfo[] {
  const program = createNodeTypesProgram(srcDir, tsconfigPath);
  return extractNodeTypes(program, srcDir);
}

/**
 * Extract each node's type info from a consumer's server source and write it to
 * the client cache (`node-types.json`), keyed by node type, for the help
 * generator. Returns the number of nodes written.
 */
function writeNodeTypes(
  srcDir: string,
  outDir: string,
  tsconfigPath?: string,
): number {
  const infos = extractNodeTypesFromSrc(srcDir, tsconfigPath);
  const byType: Record<string, NodeTypeInfo> = {};
  for (const info of infos) byType[info.type] = info;
  const outPath = nodeTypesPath(outDir);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(byType));
  return infos.length;
}

export {
  createNodeTypesProgram,
  extractNodeTypes,
  extractNodeTypesFromSrc,
  writeNodeTypes,
  BASE_CLASS_SLOTS,
};
export type { NodeTypeInfo, NodeRoleType, NodeFieldInfo, NodeOutputPort };
