import type { Plugin } from "vite";
import fs from "fs";
import path from "path";

function localesGenerator(options: {
  outDir: string;
  docsDir: string;
  labelsDir: string;
}): Plugin {
  const { outDir, docsDir, labelsDir } = options;
  const languages = [
    "en-US",
    "de",
    "es-ES",
    "fr",
    "ko",
    "pt-BR",
    "ru",
    "ja",
    "zh-CN",
    "zh-TW",
  ];

  return {
    name: "vite-plugin-node-red:client:locales-generator",
    apply: "build",
    enforce: "post",

    closeBundle() {
      function validateLanguage(lang: string, filePath: string) {
        if (!languages.includes(lang)) {
          throw new Error(
            `[locales] Invalid language "${lang}" in "${filePath}".\n` +
              `Supported: ${languages.join(", ")}`,
          );
        }
      }

      function forEachFile<T>(
        baseDir: string,
        fileExtensions: string[],
        processFile: (params: {
          ext: string;
          filePath: string;
          nodeType: string;
        }) => T | null,
      ): Map<string, T extends unknown[] ? T : Record<string, T>> {
        const langMap = new Map();

        if (!fs.existsSync(baseDir)) return langMap;

        const nodeDirs = fs
          .readdirSync(baseDir, { withFileTypes: true })
          .filter((d) => d.isDirectory());

        for (const nodeDir of nodeDirs) {
          const nodeType = nodeDir.name;
          const nodePath = path.join(baseDir, nodeType);
          const files = fs.readdirSync(nodePath);

          for (const file of files) {
            const ext = path.extname(file);
            if (!fileExtensions.includes(ext)) continue;

            const lang = path.basename(file, ext);
            const filePath = path.join(nodePath, file);
            validateLanguage(lang, filePath);

            const value = processFile({ ext, filePath, nodeType });
            if (value == null) continue;

            if (!langMap.has(lang)) {
              langMap.set(lang, Array.isArray(value) ? [] : {});
            }

            if (Array.isArray(value)) {
              langMap.get(lang).push(...value);
            } else {
              langMap.get(lang)[nodeType] = value;
            }
          }
        }

        return langMap;
      }

      function writeOutput<T>(
        langMap: Map<string, T>,
        fileName: string,
        serialize: (value: T) => string,
      ) {
        for (const [lang, data] of langMap.entries()) {
          const langOutDir = path.join(outDir, lang);
          fs.mkdirSync(langOutDir, { recursive: true });
          fs.writeFileSync(
            path.join(langOutDir, fileName),
            serialize(data),
            "utf-8",
          );
        }
      }

      const docLangs = forEachFile(
        docsDir,
        [".html", ".md"],
        ({ ext, filePath, nodeType }) => {
          const type =
            ext === ".html"
              ? "text/html"
              : ext === ".md"
                ? "text/markdown"
                : null;
          if (!type) return null;

          const content = fs.readFileSync(filePath, "utf-8");
          return [
            `<script type="${type}" data-help-name="${nodeType}">\n${content}\n</script>`,
          ];
        },
      );

      writeOutput(docLangs, "index.html", (value: string[]) =>
        value.join("\n"),
      );

      const labelLangs = forEachFile(
        labelsDir,
        [".json"],
        ({ filePath, nodeType }) => {
          const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
          if (parsed[nodeType] && typeof parsed[nodeType] === "object") {
            console.warn(
              `[locales] Warning: "${filePath}" uses nested format (root key "${nodeType}"). ` +
                `Label files should be flat — the node type is added automatically. ` +
                `See https://bonsaedev.github.io/nrg/guide/building-and-running`,
            );
          }
          return parsed;
        },
      );

      writeOutput(labelLangs, "index.json", (value) =>
        JSON.stringify(value, null, 2),
      );
    },
  };
}

export { localesGenerator };
