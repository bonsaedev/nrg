import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  composeValidationSchema,
  validateNode,
  validateForm,
  validateSchemaString,
  validateSchemaFields,
} from "@/sdk/lib/client/validation";

const baseSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    count: { type: "number" },
  },
  required: ["name"],
  additionalProperties: true,
};

const pwdSchema = {
  type: "object",
  properties: {
    credentials: {
      type: "object",
      properties: {
        token: { type: "string", format: "password", minLength: 1 },
      },
      required: ["token"],
    },
  },
  additionalProperties: true,
};

describe("validateNode", () => {
  it("returns true for valid data", () => {
    const result = validateNode({ type: "vn-base", name: "hello" }, baseSchema);
    expect(result).toBe(true);
  });

  it("returns error messages for invalid data", () => {
    const result = validateNode({ type: "vn-base" }, baseSchema);
    expect(result).not.toBe(true);
    expect(result).toBeInstanceOf(Array);
    expect(result).toHaveLength(1);
    expect((result as string[])[0]).toContain("name");
  });

  it("returns error when type is wrong", () => {
    const result = validateNode(
      { type: "vn-base", name: "hello", count: "not-a-number" },
      baseSchema,
    );
    expect(result).not.toBe(true);
    expect((result as string[])[0]).toContain("count");
  });

  it("formats required-field errors with full path", () => {
    const result = validateNode({ type: "vn-base" }, baseSchema) as string[];
    expect(result[0]).toBe("name: must have required property 'name'");
  });

  it("skips password errors when server has the credential", () => {
    const subject = {
      type: "vn-pwd",
      credentials: { token: "", has_token: true },
    };
    expect(validateNode(subject, pwdSchema)).toBe(true);
  });

  it("skips password errors for __PWD__ placeholder", () => {
    const subject = {
      type: "vn-pwd",
      credentials: { token: "__PWD__", has_token: true },
    };
    expect(validateNode(subject, pwdSchema)).toBe(true);
  });

  it("reports password errors when no server value exists", () => {
    const subject = {
      type: "vn-pwd",
      credentials: { token: "" },
    };
    const result = validateNode(subject, pwdSchema);
    expect(result).not.toBe(true);
  });

  it("skips password errors when credentials object is absent", () => {
    const subject = { type: "vn-pwd" };
    expect(validateNode(subject, pwdSchema)).toBe(true);
  });
});

describe("validateForm", () => {
  it("returns empty object for valid data", () => {
    const result = validateForm({ type: "vf-base", name: "hello" }, baseSchema);
    expect(result).toEqual({});
  });

  it("returns keyed errors with dot-path notation", () => {
    const result = validateForm({ type: "vf-base" }, baseSchema);
    expect(result).toHaveProperty("node.name");
  });

  it("returns error message in values", () => {
    const result = validateForm(
      { type: "vf-base", name: "ok", count: "not-a-number" },
      baseSchema,
    );
    expect(result["node.count"]).toBeDefined();
    expect(typeof result["node.count"]).toBe("string");
  });

  it("skips password fields with __PWD__ placeholder", () => {
    const schema = {
      type: "object",
      properties: {
        credentials: {
          type: "object",
          properties: {
            secret: { type: "string", format: "password", minLength: 1 },
          },
          required: ["secret"],
        },
      },
      additionalProperties: true,
    };
    const result = validateForm(
      { type: "vf-pwd", credentials: { secret: "__PWD__" } },
      schema,
    );
    expect(result).toEqual({});
  });

  it("reports password errors for non-placeholder values", () => {
    const schema = {
      type: "object",
      properties: {
        credentials: {
          type: "object",
          properties: {
            secret: { type: "string", format: "password", minLength: 1 },
          },
          required: ["secret"],
        },
      },
      additionalProperties: true,
    };
    const result = validateForm(
      { type: "vf-pwd", credentials: { secret: "" } },
      schema,
    );
    expect(Object.keys(result).length).toBeGreaterThan(0);
  });

  it("builds nested dot-path keys for credential errors", () => {
    const schema = {
      type: "object",
      properties: {
        credentials: {
          type: "object",
          properties: {
            apiKey: { type: "string", minLength: 1 },
          },
          required: ["apiKey"],
        },
      },
      additionalProperties: true,
    };
    const result = validateForm({ type: "vf-cred", credentials: {} }, schema);
    expect(result).toHaveProperty("node.credentials.apiKey");
  });

  it("does NOT skip password errors via has_ flag (unlike validateNode)", () => {
    const schema = {
      type: "object",
      properties: {
        credentials: {
          type: "object",
          properties: {
            token: { type: "string", format: "password", minLength: 1 },
          },
          required: ["token"],
        },
      },
      additionalProperties: true,
    };
    const result = validateForm(
      { type: "vf-has", credentials: { token: "", has_token: true } },
      schema,
    );
    expect(Object.keys(result).length).toBeGreaterThan(0);
  });

  it("returns multiple errors for multiple invalid fields", () => {
    const schema = {
      type: "object",
      properties: {
        name: { type: "string", minLength: 1 },
        url: { type: "string", minLength: 1 },
      },
      required: ["name", "url"],
      additionalProperties: true,
    };
    const result = validateForm({ type: "vf-multi" }, schema);
    expect(Object.keys(result).length).toBe(2);
    expect(result).toHaveProperty("node.name");
    expect(result).toHaveProperty("node.url");
  });
});

describe("validateSchemaString", () => {
  it("passes for empty or whitespace (no override)", () => {
    expect(validateSchemaString("")).toBeNull();
    expect(validateSchemaString("   ")).toBeNull();
  });

  it("passes for a valid JSON Schema", () => {
    expect(
      validateSchemaString(
        '{"type":"object","properties":{"payload":{"type":"string"}},"required":["payload"]}',
      ),
    ).toBeNull();
  });

  it("reports invalid JSON with a helpful message", () => {
    const msg = validateSchemaString("{ not json");
    expect(msg).not.toBeNull();
    expect(msg).toContain("Invalid JSON");
  });

  it("reports a non-object schema (array / primitive)", () => {
    expect(validateSchemaString("[1,2,3]")).toContain("expected an object");
    expect(validateSchemaString("42")).toContain("expected an object");
  });

  it("reports an invalid JSON Schema (valid JSON, uncompilable)", () => {
    // Valid JSON, but the $ref can't be resolved — AJV throws at compile, the
    // same failure the runtime would hit at deploy.
    const msg = validateSchemaString('{"$ref":"#/definitions/DoesNotExist"}');
    expect(msg).not.toBeNull();
    expect(msg).toContain("Invalid JSON Schema");
  });

  it("ignores a stale $id so an edited schema recompiles", () => {
    // Same $id, different content across two calls: the first is valid, the
    // second is broken — the broken one must still be reported (no stale cache).
    expect(validateSchemaString('{"$id":"reused","type":"object"}')).toBeNull();
    expect(
      validateSchemaString('{"$id":"reused","$ref":"#/definitions/Nope"}'),
    ).toContain("Invalid JSON Schema");
  });
});

describe("custom formats", () => {
  it("validates node-id format", () => {
    const schema = {
      type: "object",
      properties: { id: { type: "string", format: "node-id" } },
      additionalProperties: true,
    };
    expect(validateNode({ type: "fmt-nid", id: "abc-123_XY" }, schema)).toBe(
      true,
    );
    expect(validateNode({ type: "fmt-nid", id: "bad id!" }, schema)).not.toBe(
      true,
    );
  });
});

describe("x-nrg-node-type keyword", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes when value is empty", () => {
    const schema = {
      type: "object",
      properties: {
        connection: { type: "string", "x-nrg-node-type": "my-config" },
      },
      additionalProperties: true,
    };
    expect(validateNode({ type: "kw-nrt", connection: "" }, schema)).toBe(true);
  });

  it("passes when RED.nodes.node returns matching type", () => {
    const spy = vi.fn().mockReturnValue({ type: "my-config" });
    window.RED.nodes.node = spy;

    const schema = {
      type: "object",
      properties: {
        connection: { type: "string", "x-nrg-node-type": "my-config" },
      },
      additionalProperties: true,
    };
    expect(validateNode({ type: "kw-nrt", connection: "cfg1" }, schema)).toBe(
      true,
    );
    expect(spy).toHaveBeenCalledWith("cfg1");
  });

  it("fails when RED.nodes.node returns wrong type", () => {
    window.RED.nodes.node = vi.fn().mockReturnValue({ type: "other" });

    const schema = {
      type: "object",
      properties: {
        connection: { type: "string", "x-nrg-node-type": "my-config" },
      },
      additionalProperties: true,
    };
    expect(
      validateNode({ type: "kw-nrt", connection: "cfg1" }, schema),
    ).not.toBe(true);
  });

  it("fails when RED.nodes.node returns null", () => {
    window.RED.nodes.node = vi.fn().mockReturnValue(null);

    const schema = {
      type: "object",
      properties: {
        connection: { type: "string", "x-nrg-node-type": "my-config" },
      },
      additionalProperties: true,
    };
    expect(
      validateNode({ type: "kw-nrt", connection: "cfg1" }, schema),
    ).not.toBe(true);
  });
});

describe("composeValidationSchema", () => {
  const configSchema = {
    type: "object",
    properties: {
      name: { type: "string", minLength: 1 },
    },
    required: ["name"],
  } as any;

  const credentialsSchema = {
    type: "object",
    properties: {
      token: { type: "string", format: "password", minLength: 1 },
    },
  } as any;

  it("returns undefined when neither schema is provided", () => {
    expect(composeValidationSchema(undefined, undefined)).toBeUndefined();
  });

  it("synthesizes a schema for a credentials-only node (no config schema)", () => {
    const composed = composeValidationSchema(undefined, credentialsSchema);
    expect(composed).toBeDefined();
    // The credential field is now actually validated (it used to be dropped).
    const errors = validateForm(
      { type: "creds-only", credentials: { token: "" } },
      composed!,
    );
    expect(errors["node.credentials.token"]).toBeDefined();
  });

  it("returns config schema as-is when no credentials schema", () => {
    expect(composeValidationSchema(configSchema, undefined)).toBe(configSchema);
  });

  it("nests credentials properties under a credentials object", () => {
    const composed = composeValidationSchema(configSchema, credentialsSchema);
    expect(composed).toEqual({
      type: "object",
      properties: {
        name: { type: "string", minLength: 1 },
        credentials: {
          type: "object",
          properties: {
            token: { type: "string", format: "password", minLength: 1 },
          },
        },
      },
      required: ["name"],
    });
  });

  it("does not mutate the input schemas", () => {
    const configCopy = JSON.parse(JSON.stringify(configSchema));
    const credsCopy = JSON.parse(JSON.stringify(credentialsSchema));
    composeValidationSchema(configSchema, credentialsSchema);
    expect(configSchema).toEqual(configCopy);
    expect(credentialsSchema).toEqual(credsCopy);
  });

  it("composed schema validates config and credential fields together", () => {
    const composed = composeValidationSchema(configSchema, credentialsSchema)!;
    const errors = validateForm(
      { type: "compose-test", name: "", credentials: { token: "" } },
      composed,
    );
    expect(errors["node.name"]).toBeDefined();
    expect(errors["node.credentials.token"]).toBeDefined();
  });

  describe("required[] (non-Optional) expansion", () => {
    it("makes an empty required string field fail (config)", () => {
      const schema = composeValidationSchema(
        {
          type: "object",
          properties: {
            apiKey: { type: "string" },
          },
          required: ["apiKey"],
        } as any,
        undefined,
      )!;
      // empty → error
      expect(
        validateForm({ type: "req", apiKey: "" }, schema)["node.apiKey"],
      ).toBeDefined();
      // present → no error
      expect(
        validateForm({ type: "req", apiKey: "sk-1" }, schema)["node.apiKey"],
      ).toBeUndefined();
    });

    it("makes an empty required NodeRef (node-id string) fail", () => {
      const schema = composeValidationSchema(
        {
          type: "object",
          properties: {
            config: {
              type: "string",
              format: "node-id",
              "x-nrg-node-type": "some-config",
            },
          },
          required: ["config"],
        } as any,
        undefined,
      )!;
      expect(
        validateForm({ type: "ref", config: "" }, schema)["node.config"],
      ).toBeDefined();
      const result = validateNode({ type: "ref", config: "" }, schema);
      expect(result).not.toBe(true); // error triangle fires
    });

    it("makes an empty required array field fail (minItems)", () => {
      const schema = composeValidationSchema(
        {
          type: "object",
          properties: {
            tags: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: ["tags"],
        } as any,
        undefined,
      )!;
      expect(
        validateForm({ type: "arr", tags: [] }, schema)["node.tags"],
      ).toBeDefined();
      expect(
        validateForm({ type: "arr", tags: ["a"] }, schema)["node.tags"],
      ).toBeUndefined();
    });

    it("expands required credentials too", () => {
      const schema = composeValidationSchema(undefined, {
        type: "object",
        properties: {
          apiKey: {
            type: "string",
            format: "password",
          },
        },
        required: ["apiKey"],
      } as any)!;
      // A genuinely-empty password (no server value) errors.
      expect(
        validateForm({ type: "credreq", credentials: { apiKey: "" } }, schema)[
          "node.credentials.apiKey"
        ],
      ).toBeDefined();
    });

    it("leaves Optional fields untouched (empty is valid)", () => {
      const schema = composeValidationSchema(
        {
          type: "object",
          properties: { note: { type: "string" } },
        } as any,
        undefined,
      )!;
      expect(
        validateForm({ type: "opt", note: "" }, schema)["node.note"],
      ).toBeUndefined();
    });

    it("does not override an explicit minLength", () => {
      const composed = composeValidationSchema(
        {
          type: "object",
          properties: {
            code: {
              type: "string",
              minLength: 3,
            },
          },
          required: ["code"],
        } as any,
        undefined,
      )!;
      expect((composed.properties!.code as any).minLength).toBe(3);
    });
  });

  describe("validateSchemaFields", () => {
    it("passes when schemas are valid or Validate Data is off", () => {
      expect(
        validateSchemaFields({
          validateInput: true,
          inputSchema: '{"type":"object"}',
        }),
      ).toEqual([]);
      // toggle off → not compiled at runtime, so not checked even if malformed
      expect(
        validateSchemaFields({
          validateInput: false,
          inputSchema: "{ not json",
        }),
      ).toEqual([]);
    });

    it("flags a malformed input schema when Validate Data is on", () => {
      const errors = validateSchemaFields({
        validateInput: true,
        inputSchema: "{ not json",
      });
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/^inputSchema:/);
    });

    it("flags a malformed output schema only for ports with the toggle on", () => {
      const errors = validateSchemaFields({
        outputSchemas: { "0": "{ bad", "1": "{ also bad" },
        validateOutputs: { "0": true, "1": false },
      });
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/^outputSchemas\.0:/);
    });
  });
});

// A conditional schema (`allOf: [{ if, then }]`) — the shape used for per-field
// conditional requiredness (e.g. the Apex node requiring `urlMapping` only for a
// REST resource). AJV reports the failing branch's leaf errors AND a structural
// container error ("root: must match \"then\" schema"); the framework hides the
// latter (see runValidation) so only the actionable field error is shown.
const conditionalSchema = {
  type: "object",
  properties: {
    apexType: { type: "string", enum: ["invocable", "rest"] },
    urlMapping: { type: "string" },
  },
  additionalProperties: true,
  allOf: [
    {
      if: {
        properties: { apexType: { const: "rest" } },
        required: ["apexType"],
      },
      then: {
        properties: { urlMapping: { minLength: 1 } },
        required: ["urlMapping"],
      },
    },
  ],
};

describe("conditional (if/then) validation — combinator error filtering", () => {
  it("does not fire when the condition is not met (no false positive)", () => {
    // apexType is invocable, so urlMapping is irrelevant — must be valid even empty.
    expect(
      validateNode(
        { type: "cnd", apexType: "invocable", urlMapping: "" },
        conditionalSchema,
      ),
    ).toBe(true);
  });

  it("is valid when the condition is met and satisfied", () => {
    expect(
      validateNode(
        { type: "cnd", apexType: "rest", urlMapping: "/orders/*" },
        conditionalSchema,
      ),
    ).toBe(true);
  });

  it("fires at the FIELD level (no 'root: must match then schema' noise)", () => {
    const result = validateNode(
      { type: "cnd", apexType: "rest", urlMapping: "" },
      conditionalSchema,
    ) as string[];
    expect(result).toBeInstanceOf(Array);
    expect(result.length).toBeGreaterThan(0);
    // every message is about a real field, never the structural container
    for (const msg of result) {
      expect(msg).not.toMatch(/^root:/);
      expect(msg).not.toMatch(/must match "(then|else|if)" schema/);
    }
    expect(result.some((m) => m.includes("urlMapping"))).toBe(true);
  });

  it("inline errors are keyed to the field, not the root object", () => {
    const errors = validateForm(
      { type: "cnd", apexType: "rest", urlMapping: "" },
      conditionalSchema,
    );
    expect(errors["node.urlMapping"]).toBeTruthy();
    expect(errors["node"]).toBeUndefined();
  });

  it("SAFETY: a failure that yields only a combinator error still reads invalid", () => {
    // `then: false` fails with no field-level leaf error to attach to; the filter
    // must NOT drop it (that would make an invalid node read as valid).
    const onlyCombinator = {
      type: "object",
      properties: { a: { type: "number" } },
      additionalProperties: true,
      allOf: [
        {
          if: { properties: { a: { const: 1 } }, required: ["a"] },
          then: false,
        },
      ],
    };
    const result = validateNode({ type: "cnd2", a: 1 }, onlyCombinator);
    expect(result).not.toBe(true);
    expect(result).toBeInstanceOf(Array);
    expect((result as string[]).length).toBeGreaterThan(0);
  });

  it("does not over-filter: oneOf/anyOf union errors are preserved", () => {
    const unionSchema = {
      type: "object",
      additionalProperties: true,
      oneOf: [{ required: ["a"] }, { required: ["b"] }],
    };
    // matches neither branch → oneOf fails; the error must survive the filter
    const result = validateNode({ type: "cnd3" }, unionSchema);
    expect(result).not.toBe(true);
    expect((result as string[]).length).toBeGreaterThan(0);
  });
});
