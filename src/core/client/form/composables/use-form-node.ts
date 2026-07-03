import { inject } from "vue";
import type { TSchema, Static } from "../../../shared/schemas";
import type { EditorStatic, NodeRedNode } from "../../types";

interface FormNode<
  TConfig extends TSchema = TSchema,
  TCredentials extends TSchema = TSchema,
> {
  node: NodeRedNode &
    EditorStatic<Static<TConfig>> & {
      credentials: EditorStatic<Static<TCredentials>> & Record<string, any>;
    };
  schema: Record<string, any>;
  errors: Record<string, string>;
}

/**
 * Composable that provides typed access to the form node, schema, and errors.
 * Replaces `defineProps` in custom form components — no props declaration needed.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useFormNode } from "@bonsae/nrg/client";
 * import type { ConfigsSchema, CredentialsSchema } from "../../server/schemas/my-node";
 *
 * const { node, errors } = useFormNode<typeof ConfigsSchema, typeof CredentialsSchema>();
 * node.name      // string — typed from ConfigsSchema
 * node.credentials.apiKey  // string — typed from CredentialsSchema
 * </script>
 * ```
 */
function useFormNode<
  TConfig extends TSchema = TSchema,
  TCredentials extends TSchema = TSchema,
>(): FormNode<TConfig, TCredentials> {
  const node = inject("__nrg_form_node");
  const schema = inject("__nrg_form_schema");
  const errors = inject("__nrg_form_errors");

  if (!node) {
    throw new Error(
      "useFormNode() must be called inside a form component mounted by NRG.",
    );
  }

  return {
    node,
    schema,
    errors,
  } as FormNode<TConfig, TCredentials>;
}

export { useFormNode };
