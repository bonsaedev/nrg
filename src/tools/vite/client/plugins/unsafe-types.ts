/**
 * Build-time recovery of the TypeScript type argument from `SchemaType.Unsafe<T>()`
 * I/O schema fields, so the generated node help can show `T` in its Type column.
 *
 * `T` is erased at runtime (`Unsafe<string>()` and `Unsafe<Connection>()` are the
 * byte-identical `{}`), so it can only be read from source. This is a purely
 * syntactic AST walk — no type checker, no program — keyed by each schema's
 * literal `$id`, which is present on both the source AST and the runtime schema.
 *
 * Determinism contract (same source in → same map out):
 * - Only matches `<X>.Unsafe<T>(...)` where `X` is the local name actually
 *   imported as `SchemaType` from `@bonsae/nrg/server` (handles `as` aliases),
 *   and only inside a `defineSchema(props, { $id })` call (also import-resolved).
 *   No name-only guessing, so an unrelated `foo.Unsafe<X>()` never matches.
 * - `$id` must be a string literal; computed/missing `$id` schemas are skipped.
 * - Property keys: identifier or string-literal only; computed keys skipped.
 * - Wrappers, bounded explicitly: `Unsafe<T>()` → `T`,
 *   `Array(Unsafe<T>())` → `T[]`. Nothing else is recorded.
 * - Type text has internal whitespace/newlines collapsed to single spaces.
 * - Files scanned in sorted order; a duplicate `$id` (among recorded schemas)
 *   throws rather than silently picking one.
 */

import ts from "typescript";
import fs from "node:fs";
import path from "node:path";

/** Maps each schema's `$id` to `{ propertyName: typeArgumentText }`. */
export type UnsafeTypeMap = Map<string, Record<string, string>>;

// The schema builders ship from `@bonsae/nrg/schema` (the neutral kit a schema
// module imports) and historically were re-exported from `@bonsae/nrg/server`.
// Recognize both so `Unsafe<T>` recovery works regardless of which entry the
// consumer authored against.
const NRG_BUILDER_MODULES = new Set([
  "@bonsae/nrg/schema",
  "@bonsae/nrg/server",
]);

function normalizeType(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Local names bound to nrg's `defineSchema` / `SchemaType` in this file. */
function resolveImports(sf: ts.SourceFile): {
  defineSchema: Set<string>;
  schemaType: Set<string>;
} {
  const defineSchema = new Set<string>();
  const schemaType = new Set<string>();
  sf.forEachChild((node) => {
    if (
      !ts.isImportDeclaration(node) ||
      !ts.isStringLiteral(node.moduleSpecifier) ||
      !NRG_BUILDER_MODULES.has(node.moduleSpecifier.text) ||
      !node.importClause?.namedBindings ||
      !ts.isNamedImports(node.importClause.namedBindings)
    ) {
      return;
    }
    for (const el of node.importClause.namedBindings.elements) {
      const imported = (el.propertyName ?? el.name).text;
      const local = el.name.text;
      if (imported === "defineSchema") defineSchema.add(local);
      if (imported === "SchemaType") schemaType.add(local);
    }
  });
  return { defineSchema, schemaType };
}

/** Static property name (identifier or string literal); undefined if computed. */
function staticPropName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) return name.text;
  return undefined;
}

/**
 * The `T` text for a generic `<SchemaType>.<Method><T>(...)` field whose `T` is
 * erased at runtime and only readable from source: `Unsafe<T>()`, `NodeRef<T>()`,
 * and `TypedInput<T>()`, plus `Array(Unsafe<T>())` → `T[]`. NodeRef/TypedInput
 * let the generated help show the referenced instance / resolved value type
 * (`NodeRef<Connection>`, `TypedInput<string>`) instead of a bare name.
 */
const GENERIC_METHODS = new Set(["Unsafe", "NodeRef", "TypedInput"]);

function unsafeTypeArg(
  node: ts.Expression,
  sf: ts.SourceFile,
  schemaType: Set<string>,
): string | undefined {
  if (
    !ts.isCallExpression(node) ||
    !ts.isPropertyAccessExpression(node.expression) ||
    !ts.isIdentifier(node.expression.expression) ||
    !schemaType.has(node.expression.expression.text)
  ) {
    return undefined;
  }
  const method = node.expression.name.text;
  if (GENERIC_METHODS.has(method) && node.typeArguments?.length) {
    return normalizeType(node.typeArguments[0]!.getText(sf));
  }
  if (method === "Array" && node.arguments.length) {
    const inner = unsafeTypeArg(node.arguments[0]!, sf, schemaType);
    if (inner) return `${inner}[]`;
  }
  return undefined;
}

/** `$id` + unsafe-typed properties of a `defineSchema(props, { $id })` call. */
function readSchemaCall(
  call: ts.CallExpression,
  sf: ts.SourceFile,
  schemaType: Set<string>,
): { id: string; props: Record<string, string> } | undefined {
  const [propsArg, optsArg] = call.arguments;
  if (
    !propsArg ||
    !optsArg ||
    !ts.isObjectLiteralExpression(propsArg) ||
    !ts.isObjectLiteralExpression(optsArg)
  ) {
    return undefined;
  }
  let id: string | undefined;
  for (const p of optsArg.properties) {
    if (
      ts.isPropertyAssignment(p) &&
      staticPropName(p.name) === "$id" &&
      ts.isStringLiteralLike(p.initializer)
    ) {
      id = p.initializer.text;
    }
  }
  if (!id) return undefined;

  const props: Record<string, string> = {};
  for (const p of propsArg.properties) {
    if (!ts.isPropertyAssignment(p)) continue;
    const key = staticPropName(p.name);
    if (key === undefined) continue;
    const type = unsafeTypeArg(p.initializer, sf, schemaType);
    if (type) props[key] = type;
  }
  return { id, props };
}

/** Extract the unsafe-type map from a single source string (pure, testable). */
export function extractUnsafeTypesFromSource(
  fileName: string,
  code: string,
): UnsafeTypeMap {
  const out: UnsafeTypeMap = new Map();
  const sf = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true);
  const { defineSchema, schemaType } = resolveImports(sf);
  if (defineSchema.size === 0 || schemaType.size === 0) return out;

  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      defineSchema.has(node.expression.text)
    ) {
      const result = readSchemaCall(node, sf, schemaType);
      if (result && Object.keys(result.props).length > 0) {
        if (out.has(result.id)) {
          throw new Error(
            `Duplicate schema $id "${result.id}" in ${fileName} — $id must be unique`,
          );
        }
        out.set(result.id, result.props);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      out.push(...collectTsFiles(full));
    } else if (
      entry.name.endsWith(".ts") &&
      !entry.name.endsWith(".d.ts") &&
      !entry.name.endsWith(".test.ts") &&
      !entry.name.endsWith(".spec.ts")
    ) {
      out.push(full);
    }
  }
  return out;
}

/** Scan a source directory and merge per-file maps (throws on `$id` collision). */
export function extractUnsafeTypes(srcDir: string): UnsafeTypeMap {
  const merged: UnsafeTypeMap = new Map();
  for (const file of collectTsFiles(srcDir).sort()) {
    const perFile = extractUnsafeTypesFromSource(
      file,
      fs.readFileSync(file, "utf-8"),
    );
    for (const [id, props] of perFile) {
      if (merged.has(id)) {
        throw new Error(
          `Duplicate schema $id "${id}" across ${srcDir} — $id must be unique`,
        );
      }
      merged.set(id, props);
    }
  }
  return merged;
}
