import jsonpointer from "jsonpointer";
import { Validator } from "../validator";
import type { ErrorObject } from "ajv";

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
    "flow-id": /^[a-f0-9]{16}$/,
    "topic-path": (data: string) => /^[a-zA-Z0-9/_-]+$/.test(data),
  },
});

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

export { validateNode, validateForm };
