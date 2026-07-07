import fs from "node:fs";
import path from "node:path";
import type { NodeTypeInfo } from "./node-type-info";

/**
 * Generate a package's `index.d.ts` type surface from the resolved node types.
 * One flat file with three concerns:
 *
 *   (a) inheritable class declarations — real, resolved generics, so a consumer
 *       can `import { CsvParser }` and `class Mine extends CsvParser`;
 *   (b) the `NodeTypes` registry augmentation — module augmentation of
 *       `@bonsae/nrg/server` so the editor can look up any node's port types by
 *       node-type string and type-check a wire (across packages, since every
 *       package augments the same interface);
 *   (c) the module default (`{ nodes: [...] }`).
 *
 * Types are self-contained (aliases expanded upstream); the only external
 * references are `@bonsae/nrg/server`'s IONode/ConfigNode and the built-in port
 * message types (ErrorPort/StatusPort), which the framework exports.
 */

// Prefer the self-contained `resolved` render (named types made resolvable for
// a consumer) over `text` (which may reference a bare name only in scope in the
// author's source) — so the generated types type-check standalone.
const roleText = (r?: {
  text: string;
  resolved?: string;
}): string | undefined => r?.resolved ?? r?.text;

/** Reconstruct the `Output` generic from the shape-aware ports. Named ports are
 * re-wrapped in `Port<…>` so the inheritable class preserves its named-ness — a
 * consumer who `extends` it keeps N named ports (a bare `{ … }` would collapse to
 * one object port). Positional ports stay a tuple; a single output stays itself. */
function outputTypeText(node: NodeTypeInfo): string {
  const ports = node.outputs;
  if (!ports || ports.length === 0) return "unknown";
  if (ports.length === 1 && ports[0].name === undefined)
    return roleText(ports[0].role)!;
  if (ports[0].name !== undefined) {
    return `{ ${ports
      .map((p) => `${p.name}: Port<${roleText(p.role)}>`)
      .join("; ")} }`;
  }
  return `[${ports.map((p) => roleText(p.role)).join(", ")}]`;
}

/** (a) An inheritable `export declare class` with resolved generics. */
function buildClassDecl(node: NodeTypeInfo): string {
  const base = node.kind === "io" ? "IONode" : "ConfigNode";
  const generics =
    node.kind === "io"
      ? [
          roleText(node.config) ?? "unknown",
          roleText(node.credentials) ?? "never",
          roleText(node.input) ?? "unknown",
          outputTypeText(node),
          roleText(node.settings) ?? "unknown",
        ]
      : [
          roleText(node.config) ?? "unknown",
          roleText(node.credentials) ?? "never",
          roleText(node.settings) ?? "unknown",
        ];

  const members = [`static readonly type: ${JSON.stringify(node.type)};`];
  if (node.kind === "io") {
    const ret = roleText(node.complete) ?? "void";
    members.push(
      `input(msg: ${roleText(node.input) ?? "unknown"}): Promise<${ret}>;`,
    );
  }

  return `export declare class ${node.className} extends ${base}<${generics.join(
    ", ",
  )}> {\n  ${members.join("\n  ")}\n}`;
}

/** (b) The `NodeTypes` registry augmentation — one entry per node, by type string. */
function buildRegistryAugmentation(nodes: NodeTypeInfo[]): string {
  const entry = (n: NodeTypeInfo): string => {
    const outputs = (n.outputs ?? []).map((p) => roleText(p.role)).join(", ");
    const input = roleText(n.input) ?? "unknown";
    // `complete`'s TReturn is input()'s return type; `void` when it returns
    // nothing (so a void-returning node's complete port is still wireable).
    const ret = roleText(n.complete) ?? "void";
    const lines = [
      `input: ${input};`,
      `outputs: [${outputs}];`,
      // Built-in ports carry the DELIVERED message envelope, generic over this
      // node's input (and its input() return, for complete) — so a wire drawn
      // FROM an error/complete port type-checks against the real carried message
      // (original input + `input` provenance + error data / `output` return),
      // not a stripped shape. Base `outputs` stay the bare Port value.
      `complete: CompletePort<${input}, ${ret}>;`,
      `error: ErrorPort<${input}>;`,
      `status: StatusPort;`,
    ];
    return `      ${JSON.stringify(n.type)}: {\n        ${lines.join(
      "\n        ",
    )}\n      };`;
  };

  return [
    `declare module "@bonsae/nrg/server" {`,
    `  interface NodeTypes {`,
    ...nodes.map(entry),
    `  }`,
    `}`,
  ].join("\n");
}

/** The full flat `index.d.ts` for a package (classes + registry + default). */
function buildPackageDts(
  nodes: NodeTypeInfo[],
  localTypes: Record<string, string> = {},
): string {
  const classNodes = nodes.filter((n) => n.className);
  // Only message-processing (IONode) nodes are wired, so only they get a
  // connection-registry entry; config nodes get their class decl only.
  const ioNodes = nodes.filter((n) => n.kind === "io");
  // Functional-API nodes have no class declaration to reference, so the default
  // export's `nodes` tuple types them as the base `NodeConstructor`.
  const hasFunctional = nodes.some((n) => !n.className);

  // IONode/ConfigNode are value classes (used in `extends`); NodeConstructor and
  // the port types are type-only.
  const valueImports = [
    classNodes.some((n) => n.kind === "io") && "IONode",
    classNodes.some((n) => n.kind === "config") && "ConfigNode",
  ].filter((x): x is string => Boolean(x));
  // A class node with named outputs re-wraps them in `Port<…>` (see
  // outputTypeText), so the surface must import `Port`.
  const hasNamedOutputs = classNodes.some((n) => n.outputKind === "named");
  const typeImports = [
    hasFunctional && "NodeConstructor",
    ioNodes.length && "ErrorPort",
    ioNodes.length && "CompletePort",
    ioNodes.length && "StatusPort",
    hasNamedOutputs && "Port",
  ].filter((x): x is string => Boolean(x));

  const parts: string[] = [];
  if (valueImports.length) {
    parts.push(
      `import { ${valueImports.join(", ")} } from "@bonsae/nrg/server";`,
    );
  }
  if (typeImports.length) {
    parts.push(
      `import type { ${typeImports.join(", ")} } from "@bonsae/nrg/server";`,
    );
  }
  // Declarations for named types the resolved ports reference — recursive local
  // types (no finite structural expansion) and local enums (nominal). Emitted
  // before the classes/registry that reference them.
  const localDecls = Object.keys(localTypes)
    .sort()
    .map((name) => localTypes[name]);
  parts.push(...localDecls);
  parts.push(...classNodes.map(buildClassDecl));
  if (ioNodes.length) parts.push(buildRegistryAugmentation(ioNodes));

  if (nodes.length) {
    // The module default (`export default { nodes: [...] }`): class nodes are
    // referenced by their declared class (so `typeof` preserves the exact type),
    // functional nodes fall back to the base `NodeConstructor`.
    const nodesTuple = nodes
      .map((n) => (n.className ? `typeof ${n.className}` : "NodeConstructor"))
      .join(", ");
    parts.push(`declare const _default: { nodes: [${nodesTuple}] };`);
    parts.push(`export default _default;`);
  }

  return parts.join("\n\n") + "\n";
}

/**
 * Emit the package type surface to `<entryName>.d.ts` for each entry, matching
 * the `types` field the package-json generator points at. All entries get the
 * same self-contained surface (the extractor sees every node under srcDir).
 */
function writePackageDts(
  nodes: NodeTypeInfo[],
  localTypes: Record<string, string>,
  outDir: string,
  entryNames: string[],
): void {
  const dts = buildPackageDts(nodes, localTypes);
  fs.mkdirSync(outDir, { recursive: true });
  for (const name of entryNames) {
    fs.writeFileSync(path.join(outDir, `${name}.d.ts`), dts);
  }
}

export { buildPackageDts, writePackageDts };
