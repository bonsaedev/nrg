import type { ProvidedContext } from "vitest";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Minimal shape of the vitest globalSetup context — just the `provide` we use.
// Typed locally rather than imported as `GlobalSetupContext` so it resolves
// across vitest versions (the named type isn't exported by all of them).
interface GlobalSetupContext {
  provide<K extends keyof ProvidedContext>(
    key: K,
    value: ProvidedContext[K],
  ): void;
}

/**
 * A node's schemas, serialized to plain JSON. This is the exact shape the vite
 * plugin injects into the production editor bundle (`JSON.stringify` of the
 * TypeBox schema), so component tests validate against the same data the real
 * form does — with no TypeBox `Kind` symbols or server runtime in the browser.
 */
export interface SerializedNodeSchemas {
  configSchema?: Record<string, unknown>;
  credentialsSchema?: Record<string, unknown>;
}

interface NodeClass {
  type?: string;
  configSchema?: unknown;
  credentialsSchema?: unknown;
}

interface Registry {
  nodes?: NodeClass[];
}

// vitest carries provided values from this Node globalSetup into the browser
// test workers as data. createNode() reads the map back with inject().
declare module "vitest" {
  interface ProvidedContext {
    __nrg_schemas: Record<string, SerializedNodeSchemas>;
  }
}

function serialize(schema: unknown): Record<string, unknown> | undefined {
  return schema == null
    ? undefined
    : (JSON.parse(JSON.stringify(schema)) as Record<string, unknown>);
}

/**
 * Serializes every node in a registry (`defineModule({ nodes })`) to a map
 * keyed by node `type`. Pure data in, pure data out — runs in Node.
 */
export function serializeRegistry(
  registry: Registry | undefined,
): Record<string, SerializedNodeSchemas> {
  const map: Record<string, SerializedNodeSchemas> = {};
  for (const NodeClass of registry?.nodes ?? []) {
    const type = NodeClass?.type;
    if (!type) continue;
    map[type] = {
      configSchema: serialize(NodeClass.configSchema),
      credentialsSchema: serialize(NodeClass.credentialsSchema),
    };
  }
  return map;
}

/**
 * Builds a vitest `globalSetup` that serializes an explicitly-provided node
 * registry and provides it to component tests. Use this when your registry is
 * not at the conventional `src/server` entry; otherwise reference the default
 * export of this module directly from your config.
 *
 * @example
 * ```ts
 * // tests/client/component/schemas.ts
 * import { provideSchemas } from "@bonsae/nrg/test/client/component/schemas";
 * import registry from "../../../src/server";
 * export default provideSchemas(registry);
 * ```
 */
export function provideSchemas(registry: Registry) {
  return ({ provide }: GlobalSetupContext): void => {
    provide("__nrg_schemas", serializeRegistry(registry));
  };
}

/**
 * Imports a package's node registry from the conventional `src/server` entry.
 * Resolves the default export (`defineModule({ nodes })`), or the module itself
 * if it exposes `nodes` directly. Runs in Node, so the server import is safe.
 *
 * @param cwd Package root to resolve `src/server/index.ts` against. Defaults to
 * the working directory (where vitest runs), which is the package root.
 */
export async function loadRegistry(
  cwd: string = process.cwd(),
): Promise<Registry> {
  const entry = pathToFileURL(path.resolve(cwd, "src/server/index.ts")).href;
  const mod = (await import(entry)) as { default?: Registry } & Registry;
  return mod.default ?? mod;
}

/**
 * Convention `globalSetup`: serializes the package's node registry — the
 * default export of `src/server` — and provides every node's schemas as data,
 * so component tests validate against the real schema WITHOUT value-importing
 * the server runtime into the browser. `createNode({ type })` reads it back.
 *
 * Reference it directly from your vitest config — no per-package file needed:
 *
 * ```ts
 * test: { globalSetup: ["@bonsae/nrg/test/client/component/schemas"] }
 * ```
 */
export default async function ({ provide }: GlobalSetupContext): Promise<void> {
  provide("__nrg_schemas", serializeRegistry(await loadRegistry()));
}
