/**
 * NRG ESLint conventions, importable from `@bonsae/nrg/eslint` so consumers (and
 * the create-nrg scaffold) share ONE source of truth instead of an inline copy
 * that drifts per project.
 *
 * `nrg` is a COMPLETE flat-config array — the recommended JS/TS/Vue
 * rules, the NRG plane boundaries, the node conventions, and a Prettier reset —
 * so a consumer's entire `eslint.config.js` can be just:
 *
 *   import { nrg } from "@bonsae/nrg/eslint";
 *   export default nrg;
 *
 * Because it's an array of flat-config blocks (and later blocks win), consumers
 * override any default by appending their own block:
 *
 *   import { nrg } from "@bonsae/nrg/eslint";
 *   export default [
 *     ...nrg,
 *     { rules: { "@typescript-eslint/no-explicit-any": "error" } },
 *   ];
 *
 * Advanced consumers who want to assemble their own config can import the
 * narrower `nodeConventions` (just the NRG custom rules) or the raw `plugin`.
 */

import eslint from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import eslintPluginVue from "eslint-plugin-vue";
import globals from "globals";
import typescriptEslint from "typescript-eslint";

interface EsTreeNode {
  type: string;
  name?: string;
  key?: EsTreeNode;
  value?: EsTreeNode & { value?: unknown };
  source?: { value?: unknown } | null;
  importKind?: "type" | "value";
  exportKind?: "type" | "value";
  specifiers?: Array<{
    importKind?: "type" | "value";
    exportKind?: "type" | "value";
  }>;
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

/**
 * In `schemas/<file>.ts`, any import OR re-export from the consumer's own
 * `server/` modules must be type-only. Schema modules are value-imported BACK by
 * the server node classes (a node reads its `ConfigsSchema` etc.), so a value
 * import or `export … from` of a server module from a schema closes a runtime
 * import cycle (server node ⇄ schema) — and drags the node runtime into the
 * editor bundle. `SchemaType.NodeRef<T>("type")` takes the node `type` string at
 * runtime with `T` as a type-only generic precisely so schemas never need a
 * value reference. The toolkit `@bonsae/nrg/server` is a bare specifier and stays
 * allowed; this targets the consumer's own `server/` dir, always imported
 * relatively.
 */
const schemaServerImportsTypeOnly = {
  meta: {
    type: "problem" as const,
    docs: {
      description:
        "require schema modules to import/re-export the consumer's server modules as type-only",
    },
    schema: [],
    messages: {
      valueImport:
        'Schema modules must not value-import or re-export server modules ("{{source}}") — it closes a runtime import cycle (server node ⇄ schema) and pulls the node runtime into the editor bundle. Use `import type`, and reference config nodes with SchemaType.NodeRef<T>("type").',
    },
  },
  create(context: RuleContext) {
    if (!/[\\/]schemas[\\/]/.test(context.filename)) return {};
    // A value dependency on the consumer's own server dir (always a relative
    // import). The toolkit `@bonsae/nrg/server` is a bare specifier — excluded.
    const targetsConsumerServer = (source: unknown): source is string =>
      typeof source === "string" &&
      (source.startsWith("./") || source.startsWith("../")) &&
      /(^|[\\/])server[\\/]/.test(source);
    // `import type …` / `export type … from …`, or a declaration whose every
    // specifier is an inline `type` import/export, carries no runtime edge.
    const check = (node: EsTreeNode, kind?: "type" | "value") => {
      const source = node.source?.value;
      if (!targetsConsumerServer(source)) return;
      if (kind === "type") return;
      const specifiers = node.specifiers ?? [];
      if (
        specifiers.length > 0 &&
        specifiers.every((s) => (s.importKind ?? s.exportKind) === "type")
      ) {
        return;
      }
      context.report({ node, messageId: "valueImport", data: { source } });
    };
    return {
      ImportDeclaration: (node: EsTreeNode) => check(node, node.importKind),
      // `export { X } from "…"` and `export * from "…"` create the same runtime
      // edge as an import; `export { x }` with no source is local and skipped.
      ExportNamedDeclaration: (node: EsTreeNode) =>
        check(node, node.exportKind),
      ExportAllDeclaration: (node: EsTreeNode) => check(node, node.exportKind),
    };
  },
};

const plugin = {
  meta: { name: "@bonsae/nrg" },
  rules: {
    "node-type-matches-filename": nodeTypeMatchesFilename,
    "schema-server-imports-type-only": schemaServerImportsTypeOnly,
  },
};

/** Flat-config block enforcing NRG's node conventions (the two custom rules). */
const nodeConventions = {
  plugins: { "@bonsae/nrg": plugin },
  rules: {
    "@bonsae/nrg/node-type-matches-filename": "error" as const,
    "@bonsae/nrg/schema-server-imports-type-only": "error" as const,
  },
};

/**
 * The complete, drop-in NRG flat config. Blocks are ordered so later ones win,
 * which is also what lets a consumer override any default by appending a block
 * after `...nrg`.
 */
const nrg = typescriptEslint.config(
  {
    ignores: ["**/*.d.ts", "**/coverage", "**/dist", "**/build"],
  },
  {
    extends: [
      eslint.configs.recommended,
      ...typescriptEslint.configs.recommended,
      ...eslintPluginVue.configs["flat/recommended"],
    ],
    files: ["src/**/*.{ts,vue}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals["shared-node-browser"] },
      parserOptions: {
        parser: typescriptEslint.parser,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "vue/no-mutating-props": "off",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          prefer: "type-imports",
        },
      ],
    },
  },
  // Boundary: browser/client code must never VALUE-import the node runtime. The
  // server (io-node, node:async_hooks, the node's SDKs) is server-only. Schemas
  // reach the client as serialized data — the vite plugin in production, a node
  // globalSetup in component tests — and as types via `import type` (enforced by
  // consistent-type-imports above for .vue). The node-context globalSetup that
  // does the serializing legitimately imports the server; it's exempted from
  // THIS rule below (not from linting entirely).
  {
    files: ["src/client/**/*.ts", "tests/client/**/*.ts"],
    plugins: { "@typescript-eslint": typescriptEslint.plugin },
    languageOptions: { parser: typescriptEslint.parser },
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@bonsae/nrg/server",
              allowTypeImports: true,
              message:
                "Browser/client code must not import the node runtime. Use `import type` for schema types; in tests, use serialized schema data (see tests/client/component/serialize-schemas.ts).",
            },
          ],
          patterns: [
            {
              group: ["**/server/**"],
              allowTypeImports: true,
              message:
                "Browser/client code must not value-import server modules — they pull in the node runtime. Use `import type`, or serialized schema data in tests.",
            },
            {
              group: ["**/schemas/**"],
              allowTypeImports: true,
              message:
                "Browser/client code must not value-import schema modules — they value-import @bonsae/nrg/server (TypeBox + node runtime). Use `import type`, or serialized schema data in tests.",
            },
          ],
        },
      ],
    },
  },
  // The node-context globalSetup serializes the real schemas for the browser
  // component tests, so it alone may value-import them (in Node). Exempt ONLY
  // the boundary rule — it still gets every other lint rule its siblings do.
  {
    files: ["tests/client/**/serialize-schemas.ts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": "off",
    },
  },
  // NRG node conventions, shared from the toolkit so they can't drift: a node's
  // static `type` must equal its filename in src/server/nodes, and schema
  // modules may only type-import the consumer's server modules.
  nodeConventions,
  // Prettier last: turn off every stylistic rule that would fight the formatter.
  eslintConfigPrettier,
);

export {
  nodeTypeMatchesFilename,
  schemaServerImportsTypeOnly,
  plugin,
  nodeConventions,
  nrg,
};
export default nrg;
