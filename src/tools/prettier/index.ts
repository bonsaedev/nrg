import type { Config } from "prettier";

/**
 * The default Prettier config for `@bonsae/nrg` projects. Re-export it from your
 * own Prettier config so formatting matches the framework's conventions:
 *
 * ```js
 * // prettier.config.mjs
 * export { default } from "@bonsae/nrg/prettier";
 * ```
 *
 * It's a plain options object — spread it and override any option you like:
 *
 * ```js
 * import nrg from "@bonsae/nrg/prettier";
 * export default { ...nrg, printWidth: 100 };
 * ```
 */
const config: Config = {
  semi: true,
  singleQuote: false,
  trailingComma: "all",
  printWidth: 80,
  tabWidth: 2,
};

export default config;
