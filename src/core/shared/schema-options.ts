/**
 * NRG's JSON Schema vocabulary — the custom keywords the server emits onto
 * serialized schemas and the client consumes for form rendering and
 * validation. Shared at the core root (like types.ts) so both planes derive
 * from one definition instead of drifting copies.
 */
export interface JsonSchemaObjectExtensions {
  format?: "node-id" | (string & {});
  /** expose this settings property to the editor via RED.settings */
  exportable?: boolean;
  /** set by SchemaType.NodeRef — the referenced config node type */
  "x-nrg-node-type"?: string;
  /** set by SchemaType.TypedInput — marks a TypedInput value/type pair */
  "x-nrg-typed-input"?: boolean;
  /** set by markNonValidatable — ajv skips this property */
  "x-nrg-skip-validation"?: boolean;
  /** form rendering hints consumed by the auto-generated editor form */
  "x-nrg-form"?: {
    icon?: string;
    typedInputTypes?: string[];
    editorLanguage?: string;
    toggle?: boolean;
    /**
     * Mark the field required: shows the `*` and rejects an empty value.
     * Every nrg field carries a default, so a value is never structurally
     * "missing" — this expands to a non-empty constraint (`minLength`/`minItems`
     * of 1) at validation time so the error triangle and inline error fire.
     */
    required?: boolean;
  };
}
