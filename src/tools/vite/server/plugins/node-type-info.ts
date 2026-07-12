import ts from "typescript";
import fs from "node:fs";
import path from "node:path";
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

// InTypeAlias expands a named type alias to its structure (e.g. `Config` →
// `{ … }`, `"a" | "b"` instead of the alias name) so the rendered types are
// self-contained — required for the generated .d.ts, and clearer in docs.
// Classes (NodeRef/TypedInput) are not aliases, so they still render by name.
const RENDER_FLAGS =
  ts.TypeFormatFlags.NoTruncation |
  ts.TypeFormatFlags.WriteArrayAsGenericType |
  ts.TypeFormatFlags.InTypeAlias;

interface NodeFieldInfo {
  name: string;
  type: string;
  optional: boolean;
}

interface NodeRoleType {
  /** The whole role type, rendered (e.g. `{ name: string }`, `"A" | "B"`). */
  text: string;
  /**
   * A self-contained render of the same type for the generated `.d.ts`: named
   * types are made resolvable — external types keep the author's import
   * specifier (`import("node:stream").Readable`), globals stay bare, and local
   * types are inlined structurally. `text` (used for docs) may reference a bare
   * name that only resolves in the author's source; `resolved` always resolves
   * for a consumer, so wiring type-checks aren't silently poisoned. Omitted when
   * identical to `text`.
   */
  resolved?: string;
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
  /** The declared class name (class API only) — for the inheritable re-export. */
  className?: string;
  /**
   * Absolute path to the `.ts` file the node's default export lives in. Lets the
   * editor wire-checker reference an author's own node by inline type-query
   * (`typeof import("<sourceFile>").default`) for full-fidelity source types —
   * no rendered `.d.ts`. Absent when the info came from anywhere but a live
   * program (installed-package nodes fall back to the `NodeTypes` registry).
   */
  sourceFile?: string;
  config?: NodeRoleType;
  credentials?: NodeRoleType;
  input?: NodeRoleType;
  settings?: NodeRoleType;
  /**
   * Output ports, shape-aware: a single object output → one port; a positional
   * tuple → one port per element; a named-port record → one port per name.
   */
  outputs?: NodeOutputPort[];
  /**
   * The output's port shape, so the wire-checker knows how to index the whole
   * `send()` value per port: `single` → the value itself, `tuple` → `value[P]`,
   * `named` → `value["<name>"]`. Absent when the output is untyped/vacuous.
   */
  outputKind?: "single" | "tuple" | "named";
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
 * Resolve the compiler options for a consumer's server source: base defaults
 * overlaid with their tsconfig's `compilerOptions` (needed so `@bonsae/nrg/server`
 * and NodeRef/config imports resolve exactly as the author's build does).
 *
 * The consumer's own `lib` is deliberately honored, never overridden — a node
 * that types a port as `ReadableStream`/`WritableStream` resolves it from
 * whatever lib the consumer declares (no hardcoded DOM). Shared by the help-docs
 * program and the editor wire-checker so both judge types under identical rules.
 */
function resolveConsumerCompilerOptions(
  srcDir: string,
  tsconfigPath?: string,
): ts.CompilerOptions {
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
    // Keep resolution-relevant options (incl. the consumer's own `lib`); force
    // noEmit (we only type-check).
    options = { ...options, ...parsed.options, noEmit: true };
  }

  return options;
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
  const options = resolveConsumerCompilerOptions(srcDir, tsconfigPath);
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

/**
 * Whether a port GENERIC (input or output) means "no port here". `any` and
 * `unknown` DO create a port — an untyped one, for a node that accepts/emits
 * arbitrary data — so only `never`/`void`/`undefined` suppress it. This is the
 * port-existence rule; `isVacuous` (which also excludes any/unknown) is for
 * documentation, not topology.
 */
function isAbsentPort(checker: ts.TypeChecker, type: ts.Type): boolean {
  const text = checker.typeToString(type);
  return (
    text === "never" ||
    text === "void" ||
    text === "undefined" ||
    (type.flags & ts.TypeFlags.Never) !== 0 ||
    (type.flags & ts.TypeFlags.Void) !== 0 ||
    (type.flags & ts.TypeFlags.Undefined) !== 0
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

/** How the author imported a name: the module specifier + its exported name. */
interface ImportInfo {
  specifier: string;
  name: string;
}

/** True for a relative/absolute path specifier — its target isn't shipped. */
function isRelativeSpecifier(spec: string): boolean {
  return (
    spec.startsWith(".") || spec.startsWith("/") || /^[A-Za-z]:/.test(spec)
  );
}

/**
 * Map every imported binding in a file to how the author imported it, keyed by
 * both the local alias symbol and the resolved target symbol. Lets the printer
 * turn a referenced type back into `import("<the author's specifier>").Name` —
 * the specifier a consumer of the published package can resolve.
 */
function buildImportMap(
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
): Map<ts.Symbol, ImportInfo> {
  const map = new Map<ts.Symbol, ImportInfo>();
  const add = (local: ts.Node, info: ImportInfo): void => {
    const sym = checker.getSymbolAtLocation(local);
    if (!sym) return;
    map.set(sym, info);
    if (sym.getFlags() & ts.SymbolFlags.Alias) {
      try {
        map.set(checker.getAliasedSymbol(sym), info);
      } catch {
        // getAliasedSymbol throws for some unresolved aliases — ignore.
      }
    }
  };
  for (const stmt of sourceFile.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    if (!ts.isStringLiteral(stmt.moduleSpecifier)) continue;
    const specifier = stmt.moduleSpecifier.text;
    const clause = stmt.importClause;
    if (!clause) continue;
    if (clause.name) add(clause.name, { specifier, name: "default" });
    const bindings = clause.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const el of bindings.elements) {
        add(el.name, { specifier, name: (el.propertyName ?? el.name).text });
      }
    }
  }
  return map;
}

const PRIMITIVEISH_FLAGS =
  ts.TypeFlags.String |
  ts.TypeFlags.Number |
  ts.TypeFlags.Boolean |
  ts.TypeFlags.BigInt |
  ts.TypeFlags.ESSymbol |
  ts.TypeFlags.UniqueESSymbol |
  ts.TypeFlags.Void |
  ts.TypeFlags.Undefined |
  ts.TypeFlags.Null |
  ts.TypeFlags.Never |
  ts.TypeFlags.Any |
  ts.TypeFlags.Unknown |
  ts.TypeFlags.NonPrimitive |
  ts.TypeFlags.StringLiteral |
  ts.TypeFlags.NumberLiteral |
  ts.TypeFlags.BooleanLiteral |
  ts.TypeFlags.BigIntLiteral |
  ts.TypeFlags.EnumLiteral |
  ts.TypeFlags.TemplateLiteral |
  ts.TypeFlags.StringMapping;

/** Type arguments of a type — alias args for aliases, else reference args. */
function typeArgsOf(
  checker: ts.TypeChecker,
  type: ts.Type,
): readonly ts.Type[] {
  if (type.aliasSymbol) return type.aliasTypeArguments ?? [];
  return (type as ts.TypeReference).target
    ? checker.getTypeArguments(type as ts.TypeReference)
    : [];
}

/**
 * Collector for named types that must be DECLARED in the generated `.d.ts`
 * rather than inlined: recursive local types (which have no finite structural
 * expansion) and local enums (which are nominal). Package-level, so a type used
 * by several nodes is declared once. `decls` holds full statements
 * (`type X = …;` / `enum X { … }`), emitted verbatim; `byType` maps a resolved
 * type to its assigned (collision-free) alias — keyed by the type instance, so
 * distinct generic instantiations (`Tree<number>` vs `Tree<string>`) and mutual
 * recursion each get their own monomorphized declaration.
 */
interface LocalDeclCtx {
  byType: Map<ts.Type, string>;
  decls: Map<string, string>;
  used: Set<string>;
}

function newLocalDeclCtx(): LocalDeclCtx {
  return { byType: new Map(), decls: new Map(), used: new Set() };
}

function uniqueName(ctx: LocalDeclCtx, base: string): string {
  const clean = /^[A-Za-z_$][\w$]*$/.test(base) ? base : "Local";
  let name = clean;
  for (let i = 1; ctx.used.has(name); i++) name = `${clean}$${i}`;
  ctx.used.add(name);
  return name;
}

/** A symbol that names a real type declaration (interface/class/alias/enum). */
function isNamedTypeSymbol(sym: ts.Symbol): boolean {
  return (
    (sym.getFlags() &
      (ts.SymbolFlags.Interface |
        ts.SymbolFlags.Class |
        ts.SymbolFlags.TypeAlias |
        ts.SymbolFlags.Enum |
        ts.SymbolFlags.ConstEnum |
        ts.SymbolFlags.RegularEnum)) !==
    0
  );
}

/**
 * Qualify a global type with its enclosing namespaces (`Intl.Collator`,
 * `NodeJS.ReadableStream`) — a bare `Collator` doesn't resolve.
 */
function qualifiedGlobalName(sym: ts.Symbol): string {
  const parts = [sym.getName()];
  let parent = (sym as ts.Symbol & { parent?: ts.Symbol }).parent;
  while (
    parent &&
    parent.getFlags() &
      (ts.SymbolFlags.NamespaceModule | ts.SymbolFlags.ValueModule) &&
    /^[A-Za-z_$][\w$]*$/.test(parent.getName())
  ) {
    parts.unshift(parent.getName());
    parent = (parent as ts.Symbol & { parent?: ts.Symbol }).parent;
  }
  return parts.join(".");
}

/** True when a named type is declared in the author's own (unshipped) source. */
function isLocalNamedSymbol(
  sym: ts.Symbol,
  imports: Map<ts.Symbol, ImportInfo>,
): boolean {
  const imported = imports.get(sym);
  if (imported) return isRelativeSpecifier(imported.specifier);
  const file = sym.declarations?.[0]?.getSourceFile();
  return !!file && !file.isDeclarationFile;
}

/** Whether `type` transitively references `sym` (i.e. the type is recursive). */
function referencesSymbol(
  checker: ts.TypeChecker,
  type: ts.Type,
  sym: ts.Symbol,
  at: ts.Node,
  seen: Set<ts.Type>,
): boolean {
  if (seen.has(type)) return false;
  seen.add(type);
  const kids: ts.Type[] = [];
  if (type.isUnionOrIntersection()) kids.push(...type.types);
  kids.push(...typeArgsOf(checker, type));
  if (type.flags & ts.TypeFlags.Object) {
    for (const prop of checker.getPropertiesOfType(type)) {
      kids.push(
        checker.getTypeOfSymbolAtLocation(prop, prop.valueDeclaration ?? at),
      );
    }
  }
  for (const kid of kids) {
    if ((kid.aliasSymbol ?? kid.getSymbol()) === sym) return true;
    if (referencesSymbol(checker, kid, sym, at, seen)) return true;
  }
  return false;
}

/** Reconstruct an enum declaration body (`{ A = 0, B = "x" }`) from its type. */
function renderEnumDecl(checker: ts.TypeChecker, enumSym: ts.Symbol): string {
  const decl = enumSym.declarations?.find(ts.isEnumDeclaration);
  const members = (decl?.members ?? []).map((m) => {
    const name = ts.isIdentifier(m.name)
      ? m.name.text
      : ts.isStringLiteral(m.name)
        ? JSON.stringify(m.name.text)
        : m.name.getText();
    const value = checker.getConstantValue(m);
    const rhs =
      typeof value === "string" ? JSON.stringify(value) : String(value ?? 0);
    return `${name} = ${rhs}`;
  });
  return `{ ${members.join(", ")} }`;
}

/**
 * True for an nrg node-instance type — what a `NodeRef` config field resolves to
 * on the server plane. These carry the private `NRG_NODE` brand plus framework
 * internals (RED, the Node-RED node, timers) and are nominal, not portable
 * message data — so they render as `unknown` rather than a huge, unresolvable
 * structural expansion. (They only occur in config, never on a wire.)
 */
function isNodeInstanceType(checker: ts.TypeChecker, type: ts.Type): boolean {
  if ((type.flags & ts.TypeFlags.Object) === 0) return false;
  return checker
    .getPropertiesOfType(type)
    .some((prop) => /[_@]nrg/i.test(prop.getName()));
}

/**
 * True when a node-instance type is one of the package's OWN nodes — the default
 * export of a local source file, which the build emits as its own
 * `export declare class` in the same `.d.ts`. Only such a class can be referenced
 * by name from another node's rendered types (it resolves against that sibling
 * declaration). This mirrors the extractor's own entry criterion, so it never
 * names a class that isn't emitted. An external/installed node instance (a `.d.ts`
 * declaration) or a non-exported local class is NOT emitted here — it stays opaque.
 */
function isEmittedNodeClass(type: ts.Type): boolean {
  const sym = type.aliasSymbol ?? type.getSymbol();
  const decl = sym?.declarations?.find(ts.isClassDeclaration);
  if (!decl) return false;
  const sourceFile = decl.getSourceFile();
  if (sourceFile.isDeclarationFile) return false;
  return defaultExportClass(sourceFile) === decl;
}

/**
 * Render a type into a form that resolves standalone in the published `.d.ts`,
 * so an editor's synthesized wire (`target.input = source.outputs[i]`) is
 * type-checked against the real shapes rather than a silent `any`:
 *
 * - a type the author imported keeps that import — `import("<specifier>").Name`
 *   (relative specifiers are local, handled below);
 * - a global/lib type stays a bare name (resolves for the consumer);
 * - a local non-recursive type is inlined structurally;
 * - a local RECURSIVE type or ENUM is emitted as a declaration in `ctx` and
 *   referenced by name (inlining a recursive type never terminates; an enum is
 *   nominal, so a bare value union would wrongly widen);
 * - objects/unions/tuples/arrays/functions recurse, so nested named types are
 *   handled too.
 *
 * `renderResolvable` decides name-vs-inline; `renderStructure` renders the shape.
 */
function renderResolvable(
  checker: ts.TypeChecker,
  type: ts.Type,
  at: ts.Node,
  imports: Map<ts.Symbol, ImportInfo>,
  seen: Set<ts.Type>,
  ctx?: LocalDeclCtx,
): string {
  // A NodeRef config field resolves to a node instance — nominal framework
  // internals, not portable data, so never expand it structurally. If it's one
  // of the package's own config nodes (emitted as its own class decl in this
  // same .d.ts), reference that class by name so the field types as the real
  // config node instead of `unknown`; external/non-emitted instances stay opaque.
  if (isNodeInstanceType(checker, type)) {
    const name = isEmittedNodeClass(type) ? typeDisplayName(type) : undefined;
    return name ?? "unknown";
  }

  const sym = type.aliasSymbol ?? type.getSymbol();
  if (sym && ctx) {
    // Keyed by the type instance so a self-reference (or a mutual back-edge)
    // resolves to the same alias, terminating the recursion.
    const already = ctx.byType.get(type);
    if (already) return already;

    const isEnum =
      (type.flags & (ts.TypeFlags.EnumLike | ts.TypeFlags.EnumLiteral)) !== 0 &&
      (sym.getFlags() &
        (ts.SymbolFlags.Enum |
          ts.SymbolFlags.ConstEnum |
          ts.SymbolFlags.RegularEnum)) !==
        0;
    if (isEnum && isLocalNamedSymbol(sym, imports)) {
      const name = uniqueName(ctx, sym.getName());
      ctx.byType.set(type, name);
      // `declare` — a bare `enum` is not a valid top-level `.d.ts` statement.
      ctx.decls.set(
        name,
        `declare enum ${name} ${renderEnumDecl(checker, sym)}`,
      );
      return name;
    }
    // A local RECURSIVE type (generic or not) — inlining never terminates, so
    // emit a monomorphized alias and reference it. The alias name is assigned
    // (and cached) BEFORE its body is rendered, so a self/mutual reference in
    // the body resolves to the name instead of recursing.
    if (
      isNamedTypeSymbol(sym) &&
      isLocalNamedSymbol(sym, imports) &&
      referencesSymbol(checker, type, sym, at, new Set())
    ) {
      const name = uniqueName(ctx, sym.getName());
      ctx.byType.set(type, name);
      ctx.decls.set(
        name,
        `type ${name} = ${renderStructure(checker, type, at, imports, seen, ctx)};`,
      );
      return name;
    }
  }
  return renderStructure(checker, type, at, imports, seen, ctx);
}

/** Render a type's shape (no name-vs-inline decision — see renderResolvable). */
function renderStructure(
  checker: ts.TypeChecker,
  type: ts.Type,
  at: ts.Node,
  imports: Map<ts.Symbol, ImportInfo>,
  seen: Set<ts.Type>,
  ctx?: LocalDeclCtx,
): string {
  const recurse = (t: ts.Type) =>
    renderResolvable(checker, t, at, imports, seen, ctx);

  // An enum member with no collector (or an external enum): its literal value
  // is self-contained and avoids referencing an undeclared enum name.
  if (
    type.flags & ts.TypeFlags.EnumLiteral &&
    !(type.flags & ts.TypeFlags.Union)
  ) {
    const value = (type as ts.LiteralType).value;
    return typeof value === "string" ? JSON.stringify(value) : String(value);
  }
  if (type.flags & PRIMITIVEISH_FLAGS) {
    return checker.typeToString(type, at, RENDER_FLAGS);
  }
  // A generic signature's type parameter renders by its name (`T`), not its
  // constraint — the enclosing `renderSignature` declares the `<T>`.
  if (type.flags & ts.TypeFlags.TypeParameter) {
    return checker.typeToString(type, at, RENDER_FLAGS);
  }
  if (type.isUnion()) return type.types.map(recurse).join(" | ");
  if (type.isIntersection()) return type.types.map(recurse).join(" & ");

  if (isTupleType(checker, type)) {
    const target = (type as ts.TupleTypeReference).target;
    const flags = target.elementFlags;
    const ro = target.readonly ? "readonly " : "";
    const parts = typeArgsOf(checker, type).map((el, i) => {
      const flag = flags[i] ?? ts.ElementFlags.Required;
      if (flag & ts.ElementFlags.Rest) return `...${recurse(el)}[]`;
      if (flag & ts.ElementFlags.Variadic) return `...${recurse(el)}`;
      // An optional element's type already carries `| undefined`; render the
      // non-nullable type with a trailing `?` (`number?`, not `number | undefined?`).
      if (flag & ts.ElementFlags.Optional) {
        return `${recurse(checker.getNonNullableType(el))}?`;
      }
      return recurse(el);
    });
    return `${ro}[${parts.join(", ")}]`;
  }
  if (typeof checker.isArrayType === "function" && checker.isArrayType(type)) {
    const el = typeArgsOf(checker, type)[0];
    const s = el ? recurse(el) : "unknown";
    const targetName = (type as ts.TypeReference).target
      ?.getSymbol?.()
      ?.getName();
    return targetName === "ReadonlyArray"
      ? `ReadonlyArray<${s}>`
      : `Array<${s}>`;
  }

  const sym = type.aliasSymbol ?? type.getSymbol();
  const args = typeArgsOf(checker, type);
  const withArgs = (base: string) =>
    args.length ? `${base}<${args.map(recurse).join(", ")}>` : base;

  if (sym) {
    const imported = imports.get(sym);
    if (imported && !isRelativeSpecifier(imported.specifier)) {
      // External package / node builtin — reference it through the author's own
      // specifier so a consumer resolves it exactly as the author's source does.
      return withArgs(
        `import(${JSON.stringify(imported.specifier)}).${imported.name}`,
      );
    }
    if (isNamedTypeSymbol(sym) && !isLocalNamedSymbol(sym, imports)) {
      // Global / lib type (Array, Date, Record, Intl.Collator, ReadableStream…)
      // — a namespace-qualified name (with args) resolves for the consumer.
      return withArgs(qualifiedGlobalName(sym));
    }
    // Local named type — inline it structurally (recursive/enum ones were
    // already turned into declarations by renderResolvable).
  }

  if (seen.has(type)) return "unknown";
  seen.add(type);
  const members: string[] = [];
  for (const sig of type.getCallSignatures()) {
    members.push(renderSignature(checker, sig, "", at, imports, seen, ctx));
  }
  for (const sig of type.getConstructSignatures()) {
    members.push(renderSignature(checker, sig, "new ", at, imports, seen, ctx));
  }
  for (const prop of checker.getPropertiesOfType(type)) {
    const raw = prop.getName();
    // Skip members that can't appear in a structural type literal: private
    // fields (`#x`) and computed/symbol-keyed members (escaped as `__@…`).
    if (raw.startsWith("#") || raw.startsWith("__@")) continue;
    const optional = (prop.getFlags() & ts.SymbolFlags.Optional) !== 0;
    let propType = checker.getTypeOfSymbolAtLocation(
      prop,
      prop.valueDeclaration ?? at,
    );
    if (optional) propType = checker.getNonNullableType(propType);
    // Quote a key that isn't a plain identifier (`"content-type"`, `"0abc"`).
    const key = /^[A-Za-z_$][\w$]*$/.test(raw) ? raw : JSON.stringify(raw);
    members.push(`${key}${optional ? "?" : ""}: ${recurse(propType)}`);
  }
  for (const info of checker.getIndexInfosOfType(type)) {
    const key = info.keyType.flags & ts.TypeFlags.Number ? "number" : "string";
    const ro = info.isReadonly ? "readonly " : "";
    members.push(`${ro}[key: ${key}]: ${recurse(info.type)}`);
  }
  seen.delete(type);
  // Match `checker.typeToString`'s object formatting exactly (trailing `; }`),
  // so a purely-structural type renders identically and `renderRole` stores no
  // `resolved` — only types with a genuinely-resolved named member differ.
  return members.length ? `{ ${members.join("; ")}; }` : "{}";
}

/** Render a call/construct signature: `<T>(a: X, b?: Y, ...rest: Z[]) => R`. */
function renderSignature(
  checker: ts.TypeChecker,
  sig: ts.Signature,
  prefix: string,
  at: ts.Node,
  imports: Map<ts.Symbol, ImportInfo>,
  seen: Set<ts.Type>,
  ctx?: LocalDeclCtx,
): string {
  // Local resolver — distinct from the module-level `render` (which renders a
  // type for docs); this one resolves named types so a signature's parts stay
  // resolvable in the generated `.d.ts`.
  const renderResolved = (t: ts.Type) =>
    renderResolvable(checker, t, at, imports, seen, ctx);

  // Generic signature type parameters (`<T extends C = D>`).
  const typeParams = (sig.getTypeParameters() ?? []).map((tp) => {
    const constraint = tp.getConstraint();
    const dflt = tp.getDefault();
    return (
      checker.typeToString(tp, at, RENDER_FLAGS) +
      (constraint ? ` extends ${renderResolved(constraint)}` : "") +
      (dflt ? ` = ${renderResolved(dflt)}` : "")
    );
  });
  const generics = typeParams.length ? `<${typeParams.join(", ")}>` : "";

  const params = sig.getParameters().map((p) => {
    const decl = p.valueDeclaration as ts.ParameterDeclaration | undefined;
    const rest = decl?.dotDotDotToken ? "..." : "";
    // A `?` or a default initializer both make a parameter optional.
    const optional = !rest && (decl?.questionToken || decl?.initializer);
    let pType = checker.getTypeOfSymbolAtLocation(p, decl ?? at);
    if (optional) pType = checker.getNonNullableType(pType);
    return `${rest}${p.getName()}${optional ? "?" : ""}: ${renderResolved(pType)}`;
  });

  // Type-predicate return (`x is Foo`, `asserts x is Foo`, `this is Foo`).
  const predicate = checker.getTypePredicateOfSignature?.(sig);
  let ret: string;
  if (predicate) {
    const asserts =
      predicate.kind === ts.TypePredicateKind.AssertsThis ||
      predicate.kind === ts.TypePredicateKind.AssertsIdentifier
        ? "asserts "
        : "";
    const subject =
      predicate.kind === ts.TypePredicateKind.This ||
      predicate.kind === ts.TypePredicateKind.AssertsThis
        ? "this"
        : predicate.parameterName;
    ret = `${asserts}${subject}${predicate.type ? ` is ${renderResolved(predicate.type)}` : ""}`;
  } else {
    ret = renderResolved(sig.getReturnType());
  }

  return `${prefix}${generics}(${params.join(", ")}): ${ret}`;
}

/** Object members of a type (empty for primitives/literals/unions). */
function objectFields(
  checker: ts.TypeChecker,
  type: ts.Type,
  at: ts.Node,
): NodeFieldInfo[] {
  if ((type.flags & DOCUMENTABLE_FIELDS) === 0) return [];
  // An array / tuple role documents its ELEMENT type (carried in the role's
  // `text`), never per-field rows — its "properties" are prototype methods
  // (`push`, `map`, `length`) and symbol members (`__@iterator`), not fields.
  if (isArrayType(checker, type) || isTupleType(checker, type)) return [];
  const fields: NodeFieldInfo[] = [];
  for (const prop of checker.getPropertiesOfType(type)) {
    const name = prop.getName();
    // Skip members that can't be a documentable named field: private (`#x`) and
    // computed / symbol-keyed members (escaped `__@…`) — the same guard
    // renderStructure uses, so a Map/iterable role never emits `__@iterator`.
    if (name.startsWith("#") || name.startsWith("__@")) continue;
    const optional = (prop.getFlags() & ts.SymbolFlags.Optional) !== 0;
    let propType = checker.getTypeOfSymbolAtLocation(prop, at);
    // Optionality is carried by the `optional` flag — don't also append
    // `| undefined` to the rendered type.
    if (optional) propType = checker.getNonNullableType(propType);
    fields.push({
      name,
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
  imports?: Map<ts.Symbol, ImportInfo>,
  ctx?: LocalDeclCtx,
): NodeRoleType | undefined {
  if (isVacuous(checker, type)) return undefined;
  const text = render(checker, type, at);
  const role: NodeRoleType = { text, fields: objectFields(checker, type, at) };
  if (imports) {
    const resolved = renderResolvable(
      checker,
      type,
      at,
      imports,
      new Set(),
      ctx,
    );
    if (resolved !== text) role.resolved = resolved;
  }
  return role;
}

/** The brand property on a `Port<T>` value (see schemas/types). */
const PORT_BRAND = "__nrg_port";

/** Built-in lifecycle port names, RESERVED — mirrors OutputPortNames (ports.ts).
 * A data port sharing one of these is unaddressable at the type level (excluded
 * from OutputPortNames, rejected by the runtime send guard), so it is dropped
 * from the extracted named ports too — otherwise the editor would show a dead
 * wire and the topology would be out of step with `send()`. */
const RESERVED_PORT_NAMES = new Set(["error", "complete", "status"]);

/** True when a type is a tuple (positional multi-output). */
function isTupleType(checker: ts.TypeChecker, type: ts.Type): boolean {
  return typeof checker.isTupleType === "function" && checker.isTupleType(type);
}

/** True when a type is an array (`T[]` / `Array<T>` / `ReadonlyArray<T>`). */
function isArrayType(checker: ts.TypeChecker, type: ts.Type): boolean {
  return typeof checker.isArrayType === "function" && checker.isArrayType(type);
}

/** The message type inside a `Port<T>`, or undefined when `type` is not a Port. */
function portInner(
  checker: ts.TypeChecker,
  type: ts.Type,
): ts.Type | undefined {
  const brand = checker.getPropertyOfType(type, PORT_BRAND);
  return brand ? checker.getTypeOfSymbol(brand) : undefined;
}

/**
 * True when a type is a record whose every value is a `Port` — i.e. named
 * ports. A tuple and a bare `Port<T>` (one port) are deliberately excluded, as
 * is a plain object (one object port).
 */
function isPortRecord(checker: ts.TypeChecker, type: ts.Type): boolean {
  if (isTupleType(checker, type) || portInner(checker, type)) return false;
  const props = checker.getPropertiesOfType(type);
  return (
    props.length > 0 &&
    props.every((p) => portInner(checker, checker.getTypeOfSymbol(p)))
  );
}

/**
 * The output's port shape, mirroring {@link extractOutputs}'s branching — but
 * returned as a single tag so a caller can tell a single-object output apart
 * from a one-element tuple (both yield one port, so the port list alone can't).
 * The wire-checker uses it to index the whole `send()` value per port.
 */
function outputPortKind(
  checker: ts.TypeChecker,
  outputType: ts.Type,
): "single" | "tuple" | "named" {
  if (isTupleType(checker, outputType)) return "tuple";
  if (isPortRecord(checker, outputType)) return "named";
  return "single";
}

/**
 * Resolve an `Output` type to its ports, shape-aware:
 * - positional tuple `[A, B]` → one port per element;
 * - named-port record `{ ok: Port<A>; err: Port<B> }` → one port per name;
 * - a single object / bare `Port<A>` → one port.
 * `Port<T>` values are unwrapped to their inner `T` wherever they appear.
 * Returns `undefined` when the output carries nothing to document (any/void).
 */
function extractOutputs(
  checker: ts.TypeChecker,
  outputType: ts.Type,
  at: ts.Node,
  imports?: Map<ts.Symbol, ImportInfo>,
  ctx?: LocalDeclCtx,
): NodeOutputPort[] | undefined {
  // `any` and `unknown` each declare ONE untyped output port — a node that emits
  // arbitrary data (a passthrough, a dynamic REST/query result). Only a truly
  // absent output (`never`/`void`/`undefined`) yields no port (there is no schema
  // fallback).
  if (isAbsentPort(checker, outputType)) return undefined;

  // A port value may be wrapped in `Port<T>`; render the inner `T`.
  const value = (type: ts.Type): ts.Type => portInner(checker, type) ?? type;
  const portRole = (type: ts.Type): NodeRoleType =>
    renderRole(checker, value(type), at, imports, ctx) ?? {
      text: render(checker, value(type), at),
      fields: [],
    };

  if (isTupleType(checker, outputType)) {
    const elems = (outputType as ts.TypeReference).typeArguments ?? [];
    return elems.map((el, index) => ({ index, role: portRole(el) }));
  }

  if (isPortRecord(checker, outputType)) {
    // Drop reserved built-in names (error/complete/status): the type-level
    // OutputPortNames already excludes them, so such a port is unaddressable —
    // keeping the topology, the type surface, and the send runtime in agreement.
    return checker
      .getPropertiesOfType(outputType)
      .filter((p) => !RESERVED_PORT_NAMES.has(p.getName()))
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

/** True when a type is the framework's off-the-wire {@link MessageLanes} — the
 * `protected`/`private` lanes the `Input<>` gate intersects onto every input.
 * Matched by BOTH its alias name AND its `protected`+`private` shape, so a user
 * type that merely shares the name (without the lane shape) is never mistaken for
 * it and stripped. */
function isMessageLanes(checker: ts.TypeChecker, type: ts.Type): boolean {
  if ((type.aliasSymbol ?? type.getSymbol())?.getName() !== "MessageLanes") {
    return false;
  }
  return (
    !!checker.getPropertyOfType(type, "protected") &&
    !!checker.getPropertyOfType(type, "private")
  );
}

/**
 * The pure WIRE type of a node's input, rendered with the off-the-wire lanes
 * stripped. `Input<Port<Wire>>` resolves to `Wire & MessageLanes`, but a
 * CONNECTION carries — and `receive()` takes — only `Wire`; the lanes must never
 * leak into the wiring registry or docs (an upstream port's plain value can't
 * satisfy `& MessageLanes`, which would make every real wire un-connectable).
 *
 * Handles every shape the `& MessageLanes` distributes into:
 *  - a UNION `Input<Port<A | B>>` → `(A & lanes) | (B & lanes)`: strip each arm,
 *    rejoin with `|`;
 *  - an INTERSECTION `Input<Port<A & B>>` → drop the lane member(s), render the
 *    rest SEPARATELY and rejoin with `&` (never flattening the lanes back in as
 *    `protected`/`private` properties);
 *  - a plain object → rendered as-is.
 * Returns `undefined` when nothing but lanes remains — an untyped
 * `Input<Port<unknown>>` resolves to just `MessageLanes` — so the caller renders
 * one untyped port.
 */
function renderWireInput(
  checker: ts.TypeChecker,
  type: ts.Type,
  at: ts.Node,
  imports: Map<ts.Symbol, ImportInfo>,
  ctx: LocalDeclCtx,
): NodeRoleType | undefined {
  const roleOf = (t: ts.Type): NodeRoleType =>
    renderRole(checker, t, at, imports, ctx) ?? {
      text: render(checker, t, at),
      fields: [],
    };
  const join = (parts: NodeRoleType[], sep: " & " | " | "): NodeRoleType => ({
    text: parts.map((p) => p.text).join(sep),
    ...(parts.some((p) => p.resolved !== undefined)
      ? { resolved: parts.map((p) => p.resolved ?? p.text).join(sep) }
      : {}),
    // an intersection merges its members' fields; a union has no single field set
    fields: sep === " & " ? parts.flatMap((p) => p.fields) : [],
  });

  if (type.isUnion()) {
    const arms = type.types
      .map((t) => renderWireInput(checker, t, at, imports, ctx))
      .filter((r): r is NodeRoleType => r !== undefined);
    if (arms.length === 0) return undefined;
    return arms.length === 1 ? arms[0] : join(arms, " | ");
  }
  if (type.isIntersection()) {
    const kept = type.types.filter((t) => !isMessageLanes(checker, t));
    if (kept.length === 0) return undefined; // only lanes → untyped wire
    const parts = kept.map(roleOf);
    return parts.length === 1 ? parts[0] : join(parts, " & ");
  }
  if (isMessageLanes(checker, type)) return undefined;
  return roleOf(type);
}

/**
 * Assign each positional type argument to its semantic role on `info`
 * (config/credentials/input/settings render directly; output is shape-aware).
 */
function assignRoleTypes(
  checker: ts.TypeChecker,
  info: NodeTypeInfo,
  slots: string[],
  typeArgs: readonly ts.Type[],
  at: ts.Node,
  imports: Map<ts.Symbol, ImportInfo>,
  ctx: LocalDeclCtx,
): void {
  typeArgs.forEach((argType, i) => {
    const role = slots[i];
    if (!role) return;
    if (info.kind === "config" && IO_ONLY_ROLES.has(role)) return;
    if (role === "output") {
      const ports = extractOutputs(checker, argType, at, imports, ctx);
      if (ports?.length) {
        info.outputs = ports;
        info.outputKind = outputPortKind(checker, argType);
      }
      return;
    }
    if (role === "input") {
      // An input port exists unless the generic is absent (never/void/undefined).
      // `any`/`unknown` DO make an (untyped) input — renderRole returns undefined
      // for them, so fall back to a bare rendered role so `info.input` is set.
      if (isAbsentPort(checker, argType)) return;
      // Show the WIRE type (what a connection carries / `receive()` takes), NOT the
      // off-the-wire lanes the `Input<>` gate intersects on — else the wiring
      // registry input would be `Wire & MessageLanes` and no upstream port could
      // connect to it. Handles union / intersection / plain wires; `undefined`
      // means the wire is untyped (only lanes remained) → one untyped port.
      info.input = renderWireInput(checker, argType, at, imports, ctx) ?? {
        text: "unknown",
        fields: [],
      };
      return;
    }
    // config / credentials / settings — documentation roles (no port), so a
    // vacuous type (incl. any/unknown) legitimately renders nothing.
    const rendered = renderRole(checker, argType, at, imports, ctx);
    if (rendered) {
      (info as unknown as Record<string, NodeRoleType>)[role] = rendered;
    }
  });
}

/** Extract type info for one class-API node, or `undefined` if not a node. */
function extractClassNode(
  checker: ts.TypeChecker,
  classDecl: ts.ClassDeclaration,
  ctx: LocalDeclCtx,
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

  const kind: "io" | "config" = base.baseName === "IONode" ? "io" : "config";
  const info: NodeTypeInfo = { type, kind, className: classDecl.name?.text };
  const imports = buildImportMap(checker, classDecl.getSourceFile());
  assignRoleTypes(
    checker,
    info,
    BASE_CLASS_SLOTS[base.baseName],
    base.typeArgs,
    classDecl,
    imports,
    ctx,
  );

  if (kind === "io") {
    const inputSym = checker.getPropertyOfType(instanceType, "input");
    if (inputSym) {
      const inputType = checker.getTypeOfSymbolAtLocation(inputSym, classDecl);
      const sig = inputType.getCallSignatures()[0];
      if (sig) {
        const ret = unwrapPromise(sig.getReturnType());
        const rendered = renderRole(checker, ret, classDecl, imports, ctx);
        if (rendered) info.complete = rendered;
      }
    }
  }

  return info;
}

/**
 * Extract every node's TypeScript type info from a program. Nodes are
 * `export default class … extends IONode/ConfigNode`; roles are read from the
 * resolved base-type instantiation and the complete port from the `input`
 * handler's return type.
 */
function extractNodeTypes(
  program: ts.Program,
  srcDir: string,
  localTypes?: Record<string, string>,
): NodeTypeInfo[] {
  const checker = program.getTypeChecker();
  const root = path.resolve(srcDir);
  const out: NodeTypeInfo[] = [];
  // Package-level, so a type shared by several nodes is declared once. Callers
  // that build a `.d.ts` pass `localTypes` to receive the declarations that the
  // resolved types reference (recursive/enum types); others discard them.
  const ctx = newLocalDeclCtx();

  for (const sourceFile of program.getSourceFiles()) {
    if (sourceFile.isDeclarationFile) continue;
    if (!path.resolve(sourceFile.fileName).startsWith(root)) continue;

    const absPath = path.resolve(sourceFile.fileName);

    const classDecl = defaultExportClass(sourceFile);
    if (classDecl) {
      const info = extractClassNode(checker, classDecl, ctx);
      if (info) {
        info.sourceFile = absPath;
        out.push(info);
      }
    }
  }

  if (localTypes) {
    for (const [name, decl] of ctx.decls) localTypes[name] = decl;
  }
  return out;
}

/** Convenience: create the program and extract in one call. */
function extractNodeTypesFromSrc(
  srcDir: string,
  tsconfigPath?: string,
  localTypes?: Record<string, string>,
): NodeTypeInfo[] {
  const program = createNodeTypesProgram(srcDir, tsconfigPath);
  return extractNodeTypes(program, srcDir, localTypes);
}

/**
 * Write already-extracted node type info to the client cache (`node-types.json`),
 * keyed by node type, for the help generator. `sourceFile` is stripped — it's an
 * absolute build-machine path only the in-process wire-checker needs, and it has
 * no place in a persisted, machine-independent artifact.
 */
function writeNodeTypesJson(infos: NodeTypeInfo[], outDir: string): void {
  const byType: Record<string, NodeTypeInfo> = {};
  for (const info of infos) {
    const { sourceFile: _sourceFile, ...rest } = info;
    byType[info.type] = rest;
  }
  const outPath = nodeTypesPath(outDir);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(byType));
}

/**
 * The port-topology descriptor injected as `<Node>.__nrgPorts`, derived purely
 * from the node's typed generics. Returns `undefined` when NEITHER `Input` nor
 * `Output` makes a port, so injection is skipped and the node is inert (0/0) —
 * there is no schema fallback. When either does, the descriptor is authoritative:
 * a port exists unless the generic is absent (`never`/`void`/`undefined`) — so
 * `any` and `unknown` each make an untyped port; `never` makes none.
 */
interface PortTopology {
  inputs: 0 | 1;
  outputs: number;
  outputNames?: string[];
}

function portTopology(info: NodeTypeInfo): PortTopology | undefined {
  const hasTypedInput = info.input !== undefined;
  const hasTypedOutput = info.outputs !== undefined;
  if (!hasTypedInput && !hasTypedOutput) return undefined;
  const outputNames =
    info.outputKind === "named"
      ? info.outputs
          ?.map((p) => p.name)
          .filter((n): n is string => n !== undefined)
      : undefined;
  return {
    inputs: hasTypedInput ? 1 : 0,
    outputs: info.outputs?.length ?? 0,
    outputNames,
  };
}

export {
  extractNodeTypes,
  extractNodeTypesFromSrc,
  writeNodeTypesJson,
  portTopology,
};
export type {
  NodeTypeInfo,
  NodeRoleType,
  NodeFieldInfo,
  NodeOutputPort,
  PortTopology,
};
