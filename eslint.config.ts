import eslint from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import eslintPluginVue from "eslint-plugin-vue";
import globals from "globals";
import typescriptEslint from "typescript-eslint";

export default typescriptEslint.config(
  {
    ignores: ["**/*.d.ts", "**/dist", "**/build.ts", "**/node_modules"],
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
      "@typescript-eslint/no-unused-vars": "off",
      "vue/no-mutating-props": "off",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          prefer: "type-imports",
        },
      ],
    },
  },
  {
    // core/shared must stay dual-plane: safe to bundle into both the server
    // runtime and the editor/browser client. Forbid importing plane-specific
    // code so the boundary can't drift (a value import would couple the planes).
    files: ["src/core/shared/**/*.{ts,vue}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/core/server/**",
                "**/core/client/**",
                "*/server",
                "*/client",
                "@bonsae/nrg/server",
                "@bonsae/nrg/client",
              ],
              message:
                "src/core/shared must stay dual-plane — import only TypeBox/ajv and other shared modules, never server- or client-only code.",
            },
          ],
        },
      ],
    },
  },
  {
    // The editor/browser plane must never VALUE-import server-only code — it
    // would pull the node runtime (io-node, node:async_hooks, ajv) into the
    // editor bundle. Types are erased at build time, so `import type` is fine.
    files: ["src/core/client/**/*.{ts,vue}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/core/server/**", "*/server", "@bonsae/nrg/server"],
              allowTypeImports: true,
              message:
                "Editor/client code must not value-import server-only modules — they pull in the node runtime. Use `import type` for cross-plane types.",
            },
          ],
        },
      ],
    },
  },
  {
    // Symmetric guard: server code must not VALUE-import the editor/browser
    // plane (Vue components, editor-only modules). `import type` is allowed.
    files: ["src/core/server/**/*.{ts,vue}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/core/client/**", "*/client", "@bonsae/nrg/client"],
              allowTypeImports: true,
              message:
                "Server code must not value-import editor/client-only modules. Use `import type` for cross-plane types.",
            },
          ],
        },
      ],
    },
  },
  eslintConfigPrettier,
);
