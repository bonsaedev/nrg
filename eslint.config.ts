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
        // Pin the TS parser root to THIS repo, statically. Without it,
        // typescript-eslint infers the root by walking up — and when a consumer
        // (e.g. bonsae-salesforce) dev-links `@bonsae/nrg`, one IDE ESLint
        // instance sees files under both repos and throws "multiple candidate
        // TSConfigRootDirs are present". `import.meta.dirname` (the dir of this
        // config) is unambiguous regardless of the ESLint process cwd.
        tsconfigRootDir: import.meta.dirname,
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
      // Node built-ins must use the `node:` protocol (unambiguous, ESM-correct).
      // Only flags real import statements — generated-code strings are untouched.
      // The shared-plane block below overrides this for src/sdk/lib/shared (which
      // imports no built-ins anyway, staying browser-safe).
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex:
                "^(assert|async_hooks|buffer|child_process|cluster|console|constants|crypto|dgram|diagnostics_channel|dns|domain|events|fs|http|http2|https|inspector|module|net|os|path|perf_hooks|process|punycode|querystring|readline|repl|stream|string_decoder|timers|tls|trace_events|tty|url|util|v8|vm|worker_threads|zlib)(/.*)?$",
              message:
                "Import Node built-ins with the `node:` protocol (e.g. `node:fs`).",
            },
          ],
        },
      ],
    },
  },
  {
    // sdk/lib/shared must stay dual-plane: safe to bundle into both the server
    // runtime and the editor/browser client. Forbid importing plane-specific
    // code so the boundary can't drift (a value import would couple the planes).
    files: ["src/sdk/lib/shared/**/*.{ts,vue}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/sdk/lib/server/**",
                "**/sdk/lib/client/**",
                "*/server",
                "*/client",
                "@bonsae/nrg/server",
                "@bonsae/nrg/client",
              ],
              message:
                "src/sdk/lib/shared must stay dual-plane — import only TypeBox/ajv and other shared modules, never server- or client-only code.",
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
    files: ["src/sdk/lib/client/**/*.{ts,vue}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/sdk/lib/server/**", "*/server", "@bonsae/nrg/server"],
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
    files: ["src/sdk/lib/server/**/*.{ts,vue}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/sdk/lib/client/**", "*/client", "@bonsae/nrg/client"],
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
