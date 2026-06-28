/**
 * nrg ESLint conventions, importable from `@bonsae/nrg/eslint` so consumers (and
 * the create-nrg scaffold) share ONE source of truth instead of an inline copy
 * that drifts per project. Spread `nrgConventions` into your flat eslint config:
 *
 *   import { nrgConventions } from "@bonsae/nrg/eslint";
 *   export default [ ...other, nrgConventions ];
 */

interface EsTreeNode {
  type: string;
  name?: string;
  key?: EsTreeNode;
  value?: EsTreeNode & { value?: unknown };
}

interface RuleContext {
  filename: string;
  report(descriptor: {
    node: EsTreeNode;
    messageId: string;
    data?: Record<string, string>;
  }): void;
}

/**
 * For any `server/nodes/<file>.ts`, the node's `static type = "..."` must equal
 * the filename. The type string is the key tying a node to its schema, component,
 * icon and locale folder (all named by the type), so a node whose `type` drifts
 * from its filename silently loses its icon/labels/help. Catches that at lint.
 */
const nodeTypeMatchesFilename = {
  meta: {
    type: "problem" as const,
    docs: {
      description:
        "require a node's static `type` to equal its filename in server/nodes",
    },
    schema: [],
    messages: {
      mismatch:
        'Node static type "{{type}}" must match the filename "{{expected}}.ts" — the type string keys the node\'s schema, component, icon and locale folder.',
    },
  },
  create(context: RuleContext) {
    const match = /[\\/]server[\\/]nodes[\\/]([^\\/]+)\.ts$/.exec(
      context.filename,
    );
    if (!match) return {};
    const expected = match[1];
    return {
      "PropertyDefinition[static=true]"(node: EsTreeNode) {
        if (
          node.key?.type === "Identifier" &&
          node.key.name === "type" &&
          node.value?.type === "Literal" &&
          typeof node.value.value === "string" &&
          node.value.value !== expected
        ) {
          context.report({
            node: node.value,
            messageId: "mismatch",
            data: { type: node.value.value, expected },
          });
        }
      },
    };
  },
};

const plugin = {
  meta: { name: "@bonsae/nrg" },
  rules: { "node-type-matches-filename": nodeTypeMatchesFilename },
};

/** Flat-config block enforcing nrg's node conventions. */
const nrgConventions = {
  plugins: { "@bonsae/nrg": plugin },
  rules: {
    "@bonsae/nrg/node-type-matches-filename": "error" as const,
  },
};

export { nodeTypeMatchesFilename, plugin, nrgConventions };
export default nrgConventions;
