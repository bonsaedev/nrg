import type { Plugin } from "vite";
import { transform } from "esbuild";

function minifier(): Plugin {
  return {
    name: "vite-plugin-node-red:client:minifier",
    apply: "build",

    async generateBundle(_options, bundle) {
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (chunk.type === "chunk" && fileName.endsWith(".js")) {
          const result = await transform(chunk.code, {
            minify: true,
          });
          chunk.code = result.code;
          chunk.map = null as any;
        }
      }
    },
  };
}

export { minifier };
