import jsonpointer from "jsonpointer";
import { cloneDeep } from "es-toolkit";
import { Validator } from "../shared/validator";
import type { ErrorObject } from "ajv";
import type { JsonSchemaObject } from "./types";

const validator = new Validator({
  customKeywords: [
    {
      keyword: "x-nrg-skip-validation",
      schemaType: "boolean",
      valid: true,
    },
    {
      keyword: "x-nrg-node-type",
      type: "string",
      validate: (schemaValue: string, dataValue: string) => {
        if (!dataValue) return true;
        const node = RED.nodes.node(dataValue);
        return !!node && node.type === schemaValue;
      },
    },
  ],
  customFormats: {
    "node-id": /^[a-zA-Z0-9-_]+$/,
  },
});

/**
 * Expands `x-nrg-form.required` into a real non-empty constraint. Every nrg
 * field carries a default, so a required value is never structurally "missing"
 * — a JSON-schema `required` array is satisfied by the empty string AJV sees.
 * A non-empty constraint (`minLength`/`minItems` of 1) is what actually makes
 * an empty required field fail validation, so the inline error and the
 * workspace error triangle fire. Strings cover text, passwords, and NodeRefs
 * (node-id strings); arrays cover multi-selects and list fields.
 *
 * Returns a new property object only for the fields it touches (the source
 * schema is a shared, embedded artifact and must not be mutated).
 */
function withRequiredConstraints(
  props?: Record<string, any>,
): Record<string, any> | undefined {
  if (!props) return props;
  let changed = false;
  const out: Record<string, any> = {};
  for (const [key, schema] of Object.entries(props)) {
    const required = schema?.["x-nrg-form"]?.required;
    // Skip when not required, or non-validatable (functions carry no constraint).
    if (!required || schema?.["x-nrg-skip-validation"]) {
      out[key] = schema;
      continue;
    }
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (types.includes("string") && schema.minLength === undefined) {
      out[key] = { ...schema, minLength: 1 };
      changed = true;
    } else if (types.includes("array") && schema.minItems === undefined) {
      out[key] = { ...schema, minItems: 1 };
      changed = true;
    } else {
      out[key] = schema;
    }
  }
  return changed ? out : props;
}

/**
 * Merges a config schema and a credentials schema into the single validation
 * schema used by both the error triangle and inline form errors. Credentials
 * are nested under a `credentials` object property, mirroring the node shape.
 * Required fields (`x-nrg-form.required`) are expanded to non-empty constraints
 * on both planes.
 */
function composeValidationSchema(
  configSchema?: JsonSchemaObject,
  credentialsSchema?: JsonSchemaObject,
): JsonSchemaObject | undefined {
  const configProps = withRequiredConstraints(configSchema?.properties);
  const credsProps = withRequiredConstraints(credentialsSchema?.properties);

  const normalizedConfig =
    configSchema && configProps !== configSchema.properties
      ? { ...configSchema, properties: configProps }
      : configSchema;

  // No credentials → the (normalized) config schema as-is (possibly undefined).
  if (!credsProps) return normalizedConfig;

  const credentialsObject: JsonSchemaObject = {
    type: "object",
    properties: credsProps,
    // Propagate `required` so required credentials are actually enforced
    // (previously they never were, even alongside a config schema).
    ...(credentialsSchema?.required
      ? { required: credentialsSchema.required }
      : {}),
  };

  if (normalizedConfig) {
    return {
      ...normalizedConfig,
      properties: {
        ...normalizedConfig.properties,
        credentials: credentialsObject,
      },
    };
  }

  // Credentials-only node (no config schema): synthesize a schema so the
  // credentials still validate. Previously this returned undefined, which
  // disabled credential validation entirely and threw on `undefined.$id`.
  return {
    type: "object",
    properties: { credentials: credentialsObject },
    additionalProperties: true,
  };
}

/**
 * Runs AJV validation and returns the raw error array — empty when valid.
 */
function runValidation(subject: any, schema: any): ErrorObject[] {
  // Validate a deep clone, NEVER the live subject. The (coercing) validator
  // rewrites string inputs to their typed values and injects schema defaults;
  // `subject` here is the reactive editor node, so mutating it would mark the
  // flow dirty on open and report phantom changes on Done. Coercion stays ON
  // (HTML inputs emit strings that must coerce to pass numeric/boolean fields) —
  // it just runs on the throwaway clone. The returned errors' instancePaths
  // still line up with `subject` (same shape), which the callers read back for
  // password filtering. The compiled validator is still cached (by the schema's
  // $id), so only the small subject is cloned per keystroke, not recompiled.
  const result = validator.validate(cloneDeep(subject), schema);
  return result.valid ? [] : (result.errors ?? []);
}

/**
 * Returns true if valid, or an array of human-readable error messages if not.
 * Compatible with Node-RED 3.x defaults.validate (2-arg style): returning
 * true means valid, returning string[] populates the error triangle tooltip.
 *
 * Password errors are skipped only when the password exists on the server
 * (`has_<prop>` is true) — the client never sees the real value in that case.
 * Genuinely empty passwords (no server value) are reported as errors.
 */
function validateNode(subject: any, schema: any): true | string[] {
  const errors = runValidation(subject, schema).filter((e) => {
    if (e.parentSchema?.format !== "password") return true;
    // No credentials on the client (import/post-save) — can't validate
    if (!subject.credentials) return false;
    const prop = e.instancePath.split("/").pop();
    const v = jsonpointer.get(subject, e.instancePath);
    // If the server has this password (has_<prop> = true) and the value is
    // empty or the __PWD__ placeholder, the user didn't change it — skip.
    // Only keep errors for values the user actually typed.
    if (subject.credentials[`has_${prop}`] && (!v || v === "__PWD__")) {
      return false;
    }
    return true;
  });
  if (errors.length === 0) return true;
  return errors.map((e) => {
    let path = e.instancePath;
    if (e.keyword === "required" && e.params?.missingProperty) {
      path = `${path}/${e.params.missingProperty}`;
    }
    return `${path.slice(1) || "root"}: ${e.message ?? "invalid"}`;
  });
}

/**
 * Converts filtered AJV errors into a keyed `Record<string, string>` for
 * inline error display, where keys are dot-paths like `"node.name"`.
 *
 * Skips password fields that hold the `__PWD__` placeholder — these represent
 * existing credentials that haven't been changed by the user.
 */
function validateForm(subject: any, schema: any): Record<string, string> {
  return runValidation(subject, schema)
    .filter((e) => {
      if (e.parentSchema?.format !== "password") return true;
      const v = jsonpointer.get(subject, e.instancePath);
      return v !== "__PWD__";
    })
    .reduce(
      (acc, error) => {
        // For `required` errors, instancePath points to the parent object,
        // not the missing property. Use params.missingProperty to build
        // the correct key so the form component can display the error.
        let path = error.instancePath;
        if (error.keyword === "required" && error.params?.missingProperty) {
          path = `${path}/${error.params.missingProperty}`;
        }
        const key = `node${path.replaceAll("/", ".")}`;
        acc[key] = error.message ?? "Invalid";
        return acc;
      },
      {} as Record<string, string>,
    );
}

/**
 * Validates a flow-author DATA-VALIDATION schema STRING (the per-port input/
 * output schema edited in the Monaco tray) the same way the runtime will — parse
 * the JSON, then compile it with the same (lenient) AJV the runtime uses, so an
 * error shown in the editor maps 1:1 to a deploy-time failure. Returns a
 * human-readable message when the string is not valid JSON or not a compilable
 * JSON Schema, else `null`. Empty/whitespace is "no override" and passes.
 *
 * Surfacing this in the editor means an invalid schema is caught while editing,
 * not only when the flow is deployed and `input()` / `send()` first compile it.
 */
function validateSchemaString(source: string): string | null {
  const trimmed = typeof source === "string" ? source.trim() : "";
  if (!trimmed) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    return `Invalid JSON: ${(err as Error).message}`;
  }

  // A JSON Schema is an object (the boolean `true`/`false` schemas are valid but
  // meaningless as a per-message schema); anything else is not usable.
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return "Invalid JSON Schema: expected an object";
  }

  // Strip `$id` before compiling so validating an edited schema never returns a
  // stale compiled form (AJV caches by `$id`) nor collides with the real
  // per-port schema registered at runtime.
  const schema: Record<string, unknown> = { ...(parsed as object) };
  delete schema.$id;

  try {
    validator.createValidator(schema, false);
  } catch (err) {
    return `Invalid JSON Schema: ${(err as Error).message}`;
  }
  return null;
}

export {
  composeValidationSchema,
  validateNode,
  validateForm,
  validateSchemaString,
};
