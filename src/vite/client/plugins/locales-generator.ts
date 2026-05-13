import type { Plugin } from "vite";
import fs from "fs";
import path from "path";
import { merge } from "es-toolkit";

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

  // Framework labels injected into every node type's locale.
  // Uses the same nested structure that Node-RED's i18next expects.
  // Users can override any key in their own label files.
  const frameworkLabels: Record<string, Record<string, unknown>> = {
    "en-US": {
      configs: { name: "Name" },
      toggles: {
        validateInput: "Validate Input",
        validateOutput: "Validate Output",
        errorPort: "Error Port",
        completePort: "Complete Port",
        statusPort: "Status Port",
      },
    },
    de: {
      configs: { name: "Name" },
      toggles: {
        validateInput: "Eingabe validieren",
        validateOutput: "Ausgabe validieren",
        errorPort: "Fehler-Port",
        completePort: "Abschluss-Port",
        statusPort: "Status-Port",
      },
    },
    "es-ES": {
      configs: { name: "Nombre" },
      toggles: {
        validateInput: "Validar entrada",
        validateOutput: "Validar salida",
        errorPort: "Puerto de error",
        completePort: "Puerto de completado",
        statusPort: "Puerto de estado",
      },
    },
    fr: {
      configs: { name: "Nom" },
      toggles: {
        validateInput: "Valider l'entrée",
        validateOutput: "Valider la sortie",
        errorPort: "Port d'erreur",
        completePort: "Port de complétion",
        statusPort: "Port de statut",
      },
    },
    ko: {
      configs: { name: "이름" },
      toggles: {
        validateInput: "입력 검증",
        validateOutput: "출력 검증",
        errorPort: "오류 포트",
        completePort: "완료 포트",
        statusPort: "상태 포트",
      },
    },
    "pt-BR": {
      configs: { name: "Nome" },
      toggles: {
        validateInput: "Validar Entrada",
        validateOutput: "Validar Saída",
        errorPort: "Porta de Erro",
        completePort: "Porta de Conclusão",
        statusPort: "Porta de Status",
      },
    },
    ru: {
      configs: { name: "Имя" },
      toggles: {
        validateInput: "Проверить вход",
        validateOutput: "Проверить выход",
        errorPort: "Порт ошибки",
        completePort: "Порт завершения",
        statusPort: "Порт статуса",
      },
    },
    ja: {
      configs: { name: "名前" },
      toggles: {
        validateInput: "入力検証",
        validateOutput: "出力検証",
        errorPort: "エラーポート",
        completePort: "完了ポート",
        statusPort: "ステータスポート",
      },
    },
    "zh-CN": {
      configs: { name: "名称" },
      toggles: {
        validateInput: "验证输入",
        validateOutput: "验证输出",
        errorPort: "错误端口",
        completePort: "完成端口",
        statusPort: "状态端口",
      },
    },
    "zh-TW": {
      configs: { name: "名稱" },
      toggles: {
        validateInput: "驗證輸入",
        validateOutput: "驗證輸出",
        errorPort: "錯誤端口",
        completePort: "完成端口",
        statusPort: "狀態端口",
      },
    },
  };

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

      // Inject framework labels as defaults for every node type.
      // User-provided labels take precedence over framework defaults.
      for (const [lang, nodeTypes] of labelLangs.entries()) {
        const defaults = frameworkLabels[lang] ?? frameworkLabels["en-US"];
        for (const nodeType of Object.keys(nodeTypes)) {
          nodeTypes[nodeType] = merge(
            structuredClone(defaults),
            nodeTypes[nodeType],
          );
        }
      }

      writeOutput(labelLangs, "index.json", (value) =>
        JSON.stringify(value, null, 2),
      );
    },
  };
}

export { localesGenerator };
