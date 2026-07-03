import { describe, it, expect } from "vitest";
import { Type } from "@sinclair/typebox";
import {
  getDefaultsFromSchema,
  getCredentialsFromSchema,
} from "@/core/shared/schemas/utils";

describe("getDefaultsFromSchema", () => {
  it("should extract default values from schema properties", () => {
    const schema = Type.Object({
      name: Type.String({ default: "my-node" }),
      retries: Type.Number({ default: 3 }),
      enabled: Type.Boolean({ default: true }),
    });

    const defaults = getDefaultsFromSchema(schema)!;

    expect(defaults.name).toEqual({
      required: false,
      value: "my-node",
      type: undefined,
    });
    expect(defaults.retries).toEqual({
      required: false,
      value: 3,
      type: undefined,
    });
    expect(defaults.enabled).toEqual({
      required: false,
      value: true,
      type: undefined,
    });
  });

  it("should skip editor-managed fields", () => {
    const schema = Type.Object({
      id: Type.String(),
      type: Type.String(),
      x: Type.Number(),
      y: Type.Number(),
      z: Type.String(),
      g: Type.String(),
      wires: Type.Array(Type.String()),
      name: Type.String({ default: "test" }),
    });

    const defaults = getDefaultsFromSchema(schema)!;

    expect(defaults.id).toBeUndefined();
    expect(defaults.type).toBeUndefined();
    expect(defaults.x).toBeUndefined();
    expect(defaults.y).toBeUndefined();
    expect(defaults.z).toBeUndefined();
    expect(defaults.g).toBeUndefined();
    expect(defaults.wires).toBeUndefined();
    expect(defaults.name).toBeDefined();
  });

  it("should set value to undefined when no default is provided", () => {
    const schema = Type.Object({
      name: Type.String(),
    });

    const defaults = getDefaultsFromSchema(schema)!;
    expect(defaults.name.value).toBeUndefined();
  });

  it("should preserve falsy defaults (0, false, empty string)", () => {
    const schema = Type.Object({
      count: Type.Number({ default: 0 }),
      enabled: Type.Boolean({ default: false }),
      label: Type.String({ default: "" }),
    });

    const defaults = getDefaultsFromSchema(schema)!;
    expect(defaults.count.value).toBe(0);
    expect(defaults.enabled.value).toBe(false);
    expect(defaults.label.value).toBe("");
  });

  it("should include x-nrg-node-type as type", () => {
    const schema = Type.Object({
      server: Type.String({
        "x-nrg-node-type": "remote-server",
      } as Record<string, unknown>),
    });

    const defaults = getDefaultsFromSchema(schema)!;
    expect(defaults.server.type).toBe("remote-server");
  });

  it("should always set required to false", () => {
    const schema = Type.Object({
      name: Type.String({ default: "test" }),
    });

    const defaults = getDefaultsFromSchema(schema)!;
    expect(defaults.name.required).toBe(false);
  });

  it("returns undefined for a null/undefined schema", () => {
    expect(getDefaultsFromSchema(null)).toBeUndefined();
    expect(getDefaultsFromSchema(undefined)).toBeUndefined();
  });
});

describe("getCredentialsFromSchema", () => {
  it("should extract credential fields with correct types", () => {
    const schema = Type.Object({
      username: Type.String({ default: "" }),
      password: Type.String({ default: "", format: "password" }),
    });

    const creds = getCredentialsFromSchema(schema)!;

    expect(creds.username).toEqual({
      required: false,
      type: "text",
      value: "",
    });
    expect(creds.password).toEqual({
      required: false,
      type: "password",
      value: "",
    });
  });

  it("should default to text type when format is not password", () => {
    const schema = Type.Object({
      apiKey: Type.String({ default: "key123" }),
    });

    const creds = getCredentialsFromSchema(schema)!;
    expect(creds.apiKey.type).toBe("text");
  });

  it("should set value to undefined when no default", () => {
    const schema = Type.Object({
      token: Type.String(),
    });

    const creds = getCredentialsFromSchema(schema)!;
    expect(creds.token.value).toBeUndefined();
  });

  it("should always set required to false", () => {
    const schema = Type.Object({
      secret: Type.String({ format: "password" }),
    });

    const creds = getCredentialsFromSchema(schema)!;
    expect(creds.secret.required).toBe(false);
  });

  it("returns undefined for a null/undefined schema", () => {
    expect(getCredentialsFromSchema(null)).toBeUndefined();
    expect(getCredentialsFromSchema(undefined)).toBeUndefined();
  });
});
