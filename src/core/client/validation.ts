import jsonpointer from "jsonpointer";
import { validator } from "../validator";
import type { ErrorObject } from "ajv";

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
    // Skip sentinel or missing values — the real password lives on the server
    const v = jsonpointer.get(subject, e.instancePath);
    return v != null && v !== "__PWD__";
  });
  if (errors.length === 0) return true;
  return errors.map(
    (e) => `${e.instancePath.slice(1) || "root"}: ${e.message ?? "invalid"}`,
  );
}

/**
 * Converts filtered AJV errors into a keyed `Record<string, string>` for
 * inline error display, where keys are dot-paths like `"node.name"`.
 *
 * Skips password fields that hold the `__PWD__` sentinel — these represent
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
        const key = `node${error.instancePath.replaceAll("/", ".")}`;
        acc[key] = error.message ?? "Invalid";
        return acc;
      },
      {} as Record<string, string>,
    );
}

export { validateNode, validateForm };
