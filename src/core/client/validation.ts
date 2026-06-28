import jsonpointer from "jsonpointer";
import { Validator } from "../validator";
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
 * Merges a config schema and a credentials schema into the single validation
 * schema used by both the error triangle and inline form errors. Credentials
 * are nested under a `credentials` object property, mirroring the node shape.
 */
function composeValidationSchema(
  configSchema?: JsonSchemaObject,
  credentialsSchema?: JsonSchemaObject,
): JsonSchemaObject | undefined {
  const credsProps = credentialsSchema?.properties;
  // No credentials → the config schema as-is (possibly undefined).
  if (!credsProps) return configSchema;

  const credentialsObject: JsonSchemaObject = {
    type: "object",
    properties: credsProps,
    // Propagate `required` so required credentials are actually enforced
    // (previously they never were, even alongside a config schema).
    ...(credentialsSchema?.required
      ? { required: credentialsSchema.required }
      : {}),
  };

  if (configSchema) {
    return {
      ...configSchema,
      properties: {
        ...configSchema.properties,
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
  const result = validator.validate(subject, schema, {
    cacheKey: `node-schema-${subject.type}`,
  });
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

export { composeValidationSchema, validateNode, validateForm };
