import { describe, test, expect } from "vitest";
import path from "node:path";
import { defineSchema, SchemaType } from "@/sdk/lib/shared/schemas";
import {
  serializeRegistry,
  loadRegistry,
} from "@/sdk/test/client/component/schemas";

const CONVENTION_PKG = path.resolve(__dirname, "fixtures/convention-pkg");
const RUNTIME_PKG = path.resolve(__dirname, "fixtures/runtime-pkg");

describe("serializeRegistry", () => {
  test("serializes each node's TypeBox schemas to plain JSON keyed by type", () => {
    const configSchema = defineSchema(
      {
        name: SchemaType.String({ minLength: 1 }),
      },
      { $id: "schemas-globalsetup.test:1" },
    );
    const credentialsSchema = defineSchema(
      {
        token: SchemaType.String({ minLength: 1 }),
      },
      { $id: "schemas-globalsetup.test:2" },
    );

    const map = serializeRegistry({
      nodes: [{ type: "widget", configSchema, credentialsSchema }],
    });

    // The real TypeBox schema (carrying Kind symbols) comes back as plain data
    // with the right shape — exactly what the vite plugin injects in production.
    expect(map.widget.configSchema).toMatchObject({
      type: "object",
      properties: { name: { type: "string", minLength: 1 } },
    });
    expect(map.widget.credentialsSchema).toMatchObject({
      type: "object",
      properties: { token: { type: "string", minLength: 1 } },
    });
    // No TypeBox Kind symbol survives JSON serialization.
    expect(Object.getOwnPropertySymbols(map.widget.configSchema!)).toHaveLength(
      0,
    );
  });

  test("omits schemas that are absent and skips nodes without a type", () => {
    const map = serializeRegistry({
      nodes: [
        { type: "no-creds", configSchema: { type: "object" } },
        { configSchema: { type: "object" } } as never, // no type → skipped
      ],
    });
    expect(map["no-creds"].credentialsSchema).toBeUndefined();
    expect(Object.keys(map)).toEqual(["no-creds"]);
  });

  test("tolerates an empty or missing registry", () => {
    expect(serializeRegistry(undefined)).toEqual({});
    expect(serializeRegistry({ nodes: [] })).toEqual({});
  });
});

describe("loadRegistry (convention)", () => {
  test("imports the src/server registry under a given cwd", async () => {
    const registry = await loadRegistry(CONVENTION_PKG);
    const map = serializeRegistry(registry);

    expect(Object.keys(map)).toEqual(["convention-node"]);
    expect(map["convention-node"].configSchema).toMatchObject({
      type: "object",
      properties: { name: { type: "string", minLength: 1 } },
    });
  });

  test("imports a registry that pulls in the server runtime barrel (AsyncLocalStorage at module load)", async () => {
    // The crash this whole feature guards against was a server import dragging
    // AsyncLocalStorage into the browser. Here the registry imports the real
    // runtime barrel — that is fine in the Node globalSetup, and loadRegistry
    // serializes it to plain data the browser can consume.
    const registry = await loadRegistry(RUNTIME_PKG);
    const map = serializeRegistry(registry);

    expect(Object.keys(map)).toEqual(["runtime-node"]);
    expect(map["runtime-node"].configSchema).toMatchObject({
      type: "object",
      properties: { name: { type: "string", minLength: 1 } },
    });
  });
});
