import { inject } from "vue";
import type { TSchema, Static } from "@sinclair/typebox";
import type { NodeRedNode, TypedInputValue } from "./types";
import type { NodeRefResolved } from "../server/schemas/types";

type _ToClient<T> =
  T extends NodeRefResolved<any>
    ? string
    : T extends { resolve(...args: any[]): any; value: unknown; type: string }
      ? TypedInputValue
      : T extends (...args: any[]) => any
        ? T
        : T extends Array<infer I>
          ? _ToClient<I>[]
          : T extends object
            ? { [K in keyof T]: _ToClient<T[K]> }
            : T;

interface FormNode<
  TConfig extends TSchema = TSchema,
  TCredentials extends TSchema = TSchema,
> {
  node: NodeRedNode &
    _ToClient<Static<TConfig>> & {
      credentials: _ToClient<Static<TCredentials>> & Record<string, any>;
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
export function useFormNode<
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
