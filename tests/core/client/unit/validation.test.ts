import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  composeValidationSchema,
  validateNode,
  validateForm,
} from "@/core/client/validation";

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
});
