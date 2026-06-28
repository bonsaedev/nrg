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
  eslintConfigPrettier,
);
