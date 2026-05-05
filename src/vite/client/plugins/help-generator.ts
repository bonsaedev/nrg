import type { Plugin } from "vite";
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { createRequire } from "module";
import { getHelpTranslations, type HelpTranslations } from "./help-i18n";

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

interface SchemaSectionOptions {
  title: string;
  schema: any;
  t: HelpTranslations;
  labels?: Record<string, string>;
  heading?: string;
  includeDefault?: boolean;
}

function generateSchemaSection(options: SchemaSectionOptions): string {
  const {
    title,
    schema,
    t,
    labels,
    heading = "###",
    includeDefault = true,
  } = options;

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
  const c = t.columns;
  const v = t.values;

  let headerCells: string;
  let rowFn: (r: PropertyRow) => string;

  if (hasLabels && includeDefault) {
    headerCells = `<th>${c.label}</th><th>${c.property}</th><th>${c.type}</th><th>${c.required}</th><th>${c.default}</th><th style="width:35%">${c.description}</th>`;
    rowFn = (r) =>
      `<tr><td>${r.label}</td><td>${r.name}</td><td>${r.type}</td><td>${r.required ? v.yes : v.no}</td><td>${r.defaultVal ? `<code>${r.defaultVal}</code>` : ""}</td><td>${r.description}</td></tr>`;
  } else if (hasLabels) {
    headerCells = `<th>${c.label}</th><th>${c.property}</th><th>${c.type}</th><th>${c.required}</th><th style="width:35%">${c.description}</th>`;
    rowFn = (r) =>
      `<tr><td>${r.label}</td><td>${r.name}</td><td>${r.type}</td><td>${r.required ? v.yes : v.no}</td><td>${r.description}</td></tr>`;
  } else if (includeDefault) {
    headerCells = `<th>${c.property}</th><th>${c.type}</th><th>${c.required}</th><th>${c.default}</th><th style="width:40%">${c.description}</th>`;
    rowFn = (r) =>
      `<tr><td>${r.name}</td><td>${r.type}</td><td>${r.required ? v.yes : v.no}</td><td>${r.defaultVal ? `<code>${r.defaultVal}</code>` : ""}</td><td>${r.description}</td></tr>`;
  } else {
    headerCells = `<th>${c.property}</th><th>${c.type}</th><th>${c.required}</th><th style="width:40%">${c.description}</th>`;
    rowFn = (r) =>
      `<tr><td>${r.name}</td><td>${r.type}</td><td>${r.required ? v.yes : v.no}</td><td>${r.description}</td></tr>`;
  }

  const tableRows = rows.map(rowFn).join("\n");

  const table = `<div style="overflow-x:auto">
<table width="100%" style="min-width:500px">
<thead><tr>${headerCells}</tr></thead>
<tbody>
${tableRows}
</tbody>
</table>
</div>`;

  const headingLevel = heading.length; // "###" = 3, "####" = 4
  const tag = `h${headingLevel}`;
  return `<${tag}>${title}</${tag}>\n${table}\n`;
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

function generateHelpDoc(
  nodeClass: any,
  labels: NodeLabels,
  t: HelpTranslations,
): string {
  const lines: string[] = [];

  if (labels.description) {
    lines.push(`<p>${labels.description}</p>`);
  }

  const configSection = generateSchemaSection({
    title: t.sections.properties,
    schema: nodeClass.configSchema,
    t,
    labels: labels.configs,
  });
  if (configSection) lines.push(configSection);

  const credsSection = generateSchemaSection({
    title: t.sections.credentials,
    schema: nodeClass.credentialsSchema,
    t,
    labels: labels.credentials,
  });
  if (credsSection) lines.push(credsSection);

  // Input — no Default column
  if (nodeClass.inputSchema) {
    const inputSection = generateSchemaSection({
      title: t.sections.input,
      schema: nodeClass.inputSchema,
      t,
      labels: labels.input,
      includeDefault: false,
    });
    if (inputSection) lines.push(inputSection);
  }

  // Output(s) — no Default column
  if (nodeClass.outputsSchema) {
    if (Array.isArray(nodeClass.outputsSchema)) {
      const portSections: string[] = [];
      nodeClass.outputsSchema.forEach((schema: any, i: number) => {
        const title = `${t.sections.port} ${i + 1}`;
        const portPropLabels = labels.outputs?.[i];
        const section = generateSchemaSection({
          title,
          schema,
          t,
          labels: portPropLabels,
          heading: "####",
          includeDefault: false,
        });
        if (section) portSections.push(section);
      });
      if (portSections.length) {
        lines.push(
          `<h3>${t.sections.outputs}</h3>\n${portSections.join("\n")}`,
        );
      }
    } else {
      const outputPropLabels = labels.outputs?.[0];
      const section = generateSchemaSection({
        title: t.sections.output,
        schema: nodeClass.outputsSchema,
        t,
        labels: outputPropLabels,
        includeDefault: false,
      });
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
          const t = getHelpTranslations(lang);
          const content = generateHelpDoc(NodeClass, labels, t);
          if (!content) continue;

          if (!helpByLang.has(lang)) helpByLang.set(lang, []);
          helpByLang
            .get(lang)!
            .push(
              `<script type="text/html" data-help-name="${type}">\n${content}\n</script>`,
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

export {
  helpGenerator,
  buildPropertyRow,
  generateSchemaSection,
  generateHelpDoc,
};
export type {
  HelpGeneratorOptions,
  PropertyRow,
  SchemaSectionOptions,
  NodeLabels,
};
