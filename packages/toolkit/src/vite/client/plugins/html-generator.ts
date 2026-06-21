import type { Plugin } from "vite";
import mime from "mime-types";
import fs from "fs";
import path from "path";

function htmlGenerator(options: {
  packageName: string;
  licensePath?: string;
}): Plugin {
  const { packageName, licensePath } = options;

  return {
    name: "vite-plugin-node-red:client:html-generator",
    apply: "build",
    enforce: "post",

    generateBundle(_, bundle) {
      const resourcesTags = Object.keys(bundle)
        .map((fileName) => {
          const asset = bundle[fileName];
          const srcPath = path.join(
            "resources",
            packageName,
            fileName.replace(/^resources\/?/, ""),
          );

          const content =
            asset.type === "asset"
              ? asset.source
              : asset.type === "chunk"
                ? asset.code
                : null;

          if (typeof content !== "string" && !(content instanceof Uint8Array))
            return null;

          const mimeType = mime.lookup(fileName);

          switch (mimeType) {
            case "application/javascript":
            case "text/javascript":
              return `<script type="module" src="${srcPath}" defer></script>`;
            case "text/css":
              return `<link rel="stylesheet" href="${srcPath}">`;
            case "font/woff":
            case "font/woff2":
            case "application/font-woff":
            case "application/font-woff2":
            case "application/x-font-ttf":
            case "application/x-font-opentype":
            case "font/ttf":
            case "font/otf":
              return `<link rel="preload" as="font" href="${srcPath}" type="${mimeType}">`;
            default:
              return null;
          }
        })
        .filter(Boolean)
        .join("\n");

      const licenseBanner =
        licensePath && fs.existsSync(licensePath)
          ? `<!--\n${fs.readFileSync(licensePath, "utf-8")}\n-->`
          : "";

      this.emitFile({
        type: "asset",
        fileName: "index.html",
        source: `${licenseBanner}\n${resourcesTags}`,
      });
    },
  };
}

export { htmlGenerator };
