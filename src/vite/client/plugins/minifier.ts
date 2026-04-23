import type { Plugin } from "vite";
import { transform } from "esbuild";

function minifier(): Plugin {
  return {
    name: "vite-plugin-node-red:client:minifier",
    apply: "build",

    renderChunk: {
      order: "post",
      async handler(code, chunk, outputOptions) {
        if (outputOptions.format === "es" && chunk.fileName.endsWith(".js")) {
          const result = await transform(code, {
            minify: true,
            sourcemap: true,
          });
          return { code: result.code, map: result.map };
        }
        return null;
      },
    },
  };
}

export { minifier };
