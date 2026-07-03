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

const roleText = (r?: { text: string }): string | undefined => r?.text;

/** Reconstruct the `Output` generic from the shape-aware ports. */
function outputTypeText(node: NodeTypeInfo): string {
  const ports = node.outputs;
  if (!ports || ports.length === 0) return "unknown";
  if (ports.length === 1 && ports[0].name === undefined)
    return ports[0].role.text;
  if (ports[0].name !== undefined) {
    return `{ ${ports.map((p) => `${p.name}: ${p.role.text}`).join("; ")} }`;
  }
  return `[${ports.map((p) => p.role.text).join(", ")}]`;
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
    const outputs = (n.outputs ?? []).map((p) => p.role.text).join(", ");
    const lines = [
      `input: ${roleText(n.input) ?? "unknown"};`,
      `outputs: [${outputs}];`,
      `complete: ${roleText(n.complete) ?? "never"};`,
      `error: ErrorPort;`,
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
function buildPackageDts(nodes: NodeTypeInfo[]): string {
  const classNodes = nodes.filter((n) => n.className);
  // Only message-processing (IONode) nodes are wired, so only they get a
  // connection-registry entry; config nodes get their class decl only.
  const ioNodes = nodes.filter((n) => n.kind === "io");

  const baseImports = [
    classNodes.some((n) => n.kind === "io") && "IONode",
    classNodes.some((n) => n.kind === "config") && "ConfigNode",
  ].filter((x): x is string => Boolean(x));

  const parts: string[] = [];
  if (baseImports.length) {
    parts.push(
      `import { ${baseImports.join(", ")} } from "@bonsae/nrg/server";`,
    );
  }
  if (ioNodes.length) {
    parts.push(
      `import type { ErrorPort, StatusPort } from "@bonsae/nrg/server";`,
    );
  }
  parts.push(...classNodes.map(buildClassDecl));
  if (ioNodes.length) parts.push(buildRegistryAugmentation(ioNodes));

  if (classNodes.length) {
    const nodesTuple = classNodes
      .map((n) => `typeof ${n.className}`)
      .join(", ");
    parts.push(`declare const _default: { nodes: [${nodesTuple}] };`);
    parts.push(`export default _default;`);
  }

  return parts.join("\n\n") + "\n";
}

export { buildPackageDts, buildRegistryAugmentation };
