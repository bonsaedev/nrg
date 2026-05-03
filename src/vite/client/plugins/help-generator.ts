import type { Plugin } from "vite";
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { createRequire } from "module";

interface HelpGeneratorOptions {
  outDir: string;
  localesOutDir: string;
  docsDir: string;
  labelsDir: string;
}

interface PropertyRow {
  name: string;
  label: string;
  type: string;
  required: boolean;
  defaultVal: string;
  description: string;
}

function buildPropertyRow(
  name: string,
  schema: any,
  required: boolean,
  label?: string,
): PropertyRow {
  let type = "";
  if (schema["x-nrg-node-type"]) {
    type = `NodeRef → ${schema["x-nrg-node-type"]}`;
  } else if (schema["x-nrg-typed-input"]) {
    type = "TypedInput";
  } else if (schema.type) {
    type = String(schema.type);
  }

  if (schema.enum) type += ` (${schema.enum.join(", ")})`;

  const constraints: string[] = [];
  if (schema.minLength !== undefined)
    constraints.push(`min: ${schema.minLength}`);
  if (schema.maxLength !== undefined)
    constraints.push(`max: ${schema.maxLength}`);
  if (schema.minimum !== undefined) constraints.push(`min: ${schema.minimum}`);
  if (schema.maximum !== undefined) constraints.push(`max: ${schema.maximum}`);
  if (schema.pattern) constraints.push(`pattern: \`${schema.pattern}\``);
  if (schema.format && schema.format !== "password")
    constraints.push(`format: ${schema.format}`);
  if (constraints.length) type += ` [${constraints.join(", ")}]`;

  const defaultVal =
    schema.default !== undefined ? JSON.stringify(schema.default) : "";
  const description = schema.description ?? "";

  return { name, label: label ?? "", type, required, defaultVal, description };
}

const SKIP_FIELDS = new Set([
  "id",
  "type",
  "z",
  "name",
  "wires",
  "x",
  "y",
  "g",
  "_users",
]);

function generateSchemaSection(
  title: string,
  schema: any,
  labels?: Record<string, string>,
  heading = "###",
): string {
  if (!schema?.properties) return "";

  const required = new Set<string>(schema.required ?? []);
  const rows = Object.entries(schema.properties)
    .filter(([key]) => !SKIP_FIELDS.has(key))
    .map(([key, propSchema]) =>
      buildPropertyRow(
        key,
        propSchema as any,
        required.has(key),
        labels?.[key],
      ),
    );

  if (rows.length === 0) return "";

  const hasLabels = rows.some((r) => r.label);

  const headerCells = hasLabels
    ? '<th>Property</th><th>Label</th><th>Type</th><th>Required</th><th>Default</th><th style="width:35%">Description</th>'
    : '<th>Property</th><th>Type</th><th>Required</th><th>Default</th><th style="width:40%">Description</th>';

  const tableRows = rows
    .map((r) =>
      hasLabels
        ? `<tr><td>${r.name}</td><td>${r.label}</td><td>${r.type}</td><td>${r.required ? "Yes" : "No"}</td><td>${r.defaultVal ? `<code>${r.defaultVal}</code>` : ""}</td><td>${r.description}</td></tr>`
        : `<tr><td>${r.name}</td><td>${r.type}</td><td>${r.required ? "Yes" : "No"}</td><td>${r.defaultVal ? `<code>${r.defaultVal}</code>` : ""}</td><td>${r.description}</td></tr>`,
    )
    .join("\n");

  const table = `<div style="overflow-x:auto">
<table width="100%" style="min-width:500px">
<thead><tr>${headerCells}</tr></thead>
<tbody>
${tableRows}
</tbody>
</table>
</div>`;

  return `${heading} ${title}\n\n${table}\n`;
}

interface NodeLabels {
  description?: string;
  configs?: Record<string, string>;
  credentials?: Record<string, string>;
  input?: Record<string, string>;
  outputs?: Record<string, string>[];
}

function loadNodeLabels(labelPath: string): NodeLabels {
  if (!fs.existsSync(labelPath)) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(labelPath, "utf-8"));
    return {
      description: raw.description,
      configs: raw.configs,
      credentials: raw.credentials,
      input: raw.input,
      outputs: raw.outputs,
    };
  } catch {
    return {};
  }
}

function generateHelpDoc(nodeClass: any, labels: NodeLabels): string {
  const lines: string[] = [];

  if (labels.description) {
    lines.push(labels.description);
    lines.push("");
  }

  const configSection = generateSchemaSection(
    "Properties",
    nodeClass.configSchema,
    labels.configs,
  );
  if (configSection) lines.push(configSection);

  const credsSection = generateSchemaSection(
    "Credentials",
    nodeClass.credentialsSchema,
    labels.credentials,
  );
  if (credsSection) lines.push(credsSection);

  // Input
  if (nodeClass.inputSchema) {
    const inputLabels = nodeClass.inputLabels;
    const inputLabel =
      typeof inputLabels === "string"
        ? inputLabels
        : Array.isArray(inputLabels)
          ? inputLabels[0]
          : undefined;
    const inputTitle = inputLabel ? `Input (${inputLabel})` : "Input";
    const inputSection = generateSchemaSection(
      inputTitle,
      nodeClass.inputSchema,
      labels.input,
    );
    if (inputSection) lines.push(inputSection);
  }

  // Output(s)
  if (nodeClass.outputsSchema) {
    const outputLabels = nodeClass.outputLabels;
    if (Array.isArray(nodeClass.outputsSchema)) {
      const portSections: string[] = [];
      nodeClass.outputsSchema.forEach((schema: any, i: number) => {
        const portLabel = Array.isArray(outputLabels)
          ? outputLabels[i]
          : undefined;
        const title = portLabel
          ? `Port ${i + 1} — ${portLabel}`
          : `Port ${i + 1}`;
        const portPropLabels = labels.outputs?.[i];
        const section = generateSchemaSection(
          title,
          schema,
          portPropLabels,
          "####",
        );
        if (section) portSections.push(section);
      });
      if (portSections.length) {
        lines.push(`### Outputs\n\n${portSections.join("\n")}`);
      }
    } else {
      const label =
        typeof outputLabels === "string"
          ? outputLabels
          : Array.isArray(outputLabels)
            ? outputLabels[0]
            : undefined;
      const title = label ? `Output (${label})` : "Output";
      const outputPropLabels = labels.outputs?.[0];
      const section = generateSchemaSection(
        title,
        nodeClass.outputsSchema,
        outputPropLabels,
      );
      if (section) lines.push(section);
    }
  }

  return lines.join("\n").trim();
}

function discoverLanguages(labelsDir: string, nodeType: string): string[] {
  const nodeLabelsDir = path.join(labelsDir, nodeType);
  if (!fs.existsSync(nodeLabelsDir)) return [];
  return fs
    .readdirSync(nodeLabelsDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => path.basename(f, ".json"));
}

function helpGenerator(options: HelpGeneratorOptions): Plugin {
  const { outDir, localesOutDir, docsDir, labelsDir } = options;

  return {
    name: "vite-plugin-node-red:client:help-generator",
    apply: "build",
    enforce: "post",

    async closeBundle() {
      const esmPath = path.resolve(outDir, "index.mjs");
      const cjsPath = path.resolve(outDir, "index.js");

      let packageFn: any;
      try {
        if (fs.existsSync(esmPath)) {
          const fileUrl = pathToFileURL(esmPath).href + `?t=${Date.now()}`;
          const mod = await import(fileUrl);
          packageFn = mod?.default ?? mod;
        } else if (fs.existsSync(cjsPath)) {
          const require = createRequire(import.meta.url);
          delete require.cache[cjsPath];
          const rawMod = require(cjsPath);
          packageFn = rawMod?.default ?? rawMod;
        }
      } catch {
        return;
      }

      const nodeClasses: any[] = packageFn?.nodes ?? [];
      const helpByLang = new Map<string, string[]>();

      for (const NodeClass of nodeClasses) {
        const type = NodeClass.type;
        if (!type) continue;

        const languages = discoverLanguages(labelsDir, type);
        if (!languages.includes("en-US")) languages.push("en-US");

        for (const lang of languages) {
          const manualMd = path.join(docsDir, type, `${lang}.md`);
          const manualHtml = path.join(docsDir, type, `${lang}.html`);
          if (fs.existsSync(manualMd) || fs.existsSync(manualHtml)) continue;

          const labelPath = path.join(labelsDir, type, `${lang}.json`);
          const labels = loadNodeLabels(labelPath);
          const content = generateHelpDoc(NodeClass, labels);
          if (!content) continue;

          if (!helpByLang.has(lang)) helpByLang.set(lang, []);
          helpByLang
            .get(lang)!
            .push(
              `<script type="text/markdown" data-help-name="${type}">\n${content}\n</script>`,
            );
        }
      }

      for (const [lang, scripts] of helpByLang) {
        const langDir = path.join(localesOutDir, lang);
        fs.mkdirSync(langDir, { recursive: true });
        const indexPath = path.join(langDir, "index.html");
        const existing = fs.existsSync(indexPath)
          ? fs.readFileSync(indexPath, "utf-8")
          : "";
        fs.writeFileSync(
          indexPath,
          existing + (existing ? "\n" : "") + scripts.join("\n"),
          "utf-8",
        );
      }
    },
  };
}

export { helpGenerator };
export type { HelpGeneratorOptions };
