import type { Plugin } from "vite";
import fs from "fs";
import path from "path";
import { getHelpTranslations, type HelpTranslations } from "./help-i18n";
import { extractUnsafeTypes, type UnsafeTypeMap } from "./unsafe-types";
import type {
  NodeTypeInfo,
  NodeFieldInfo,
  NodeRoleType,
} from "../../server/plugins/node-type-info";
import { nodeDefsPath, nodeTypesPath } from "../../utils";
import { logger } from "../../logger";

interface HelpGeneratorOptions {
  outDir: string;
  localesOutDir: string;
  docsDir: string;
  labelsDir: string;
  /** Server source dir scanned to recover `Unsafe<T>()` type arguments. */
  srcDir?: string;
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
  parsedType?: string,
  tsType?: string,
): PropertyRow {
  let type = "";
  if (tsType) {
    // The node's TypeScript type is the source of truth for the Type column.
    type = tsType;
  } else if (schema?.["x-nrg-node-type"]) {
    type = `NodeRef → ${schema["x-nrg-node-type"]}`;
  } else if (schema?.["x-nrg-typed-input"]) {
    type = "TypedInput";
  } else if (schema?.type) {
    type = String(schema.type);
  } else if (parsedType) {
    // Recovered from the source `Unsafe<T>()` type argument at build time, since
    // T is erased at runtime (see unsafe-types.ts).
    type = parsedType;
  }

  // A schema `enum` is already captured by the resolved TS union — only append
  // it when the Type came from the schema.
  if (!tsType && schema?.enum) type += ` (${schema.enum.join(", ")})`;

  // Schema constraints enrich the type even when the type itself came from TS.
  const constraints: string[] = [];
  if (schema?.minLength !== undefined)
    constraints.push(`min: ${schema.minLength}`);
  if (schema?.maxLength !== undefined)
    constraints.push(`max: ${schema.maxLength}`);
  if (schema?.minimum !== undefined) constraints.push(`min: ${schema.minimum}`);
  if (schema?.maximum !== undefined) constraints.push(`max: ${schema.maximum}`);
  if (schema?.pattern) constraints.push(`pattern: \`${schema.pattern}\``);
  if (schema?.format && schema.format !== "password")
    constraints.push(`format: ${schema.format}`);
  if (constraints.length) type += ` [${constraints.join(", ")}]`;

  const defaultVal =
    schema?.default !== undefined ? JSON.stringify(schema.default) : "";
  const description = schema?.description ?? "";

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

// nrg framework config fields — the lifecycle-port toggles, validation flags,
// and per-port output settings baked into every IONode's config. They configure
// the node's *system behavior*, not its domain configuration, so they're
// summarized in the Capabilities table rather than listed as user Properties.
// (errorPort/completePort/statusPort = BUILTIN_PORT_KEYS; the rest come from
// IONodeConfig — see src/sdk/lib/server/nodes/types/io-node.ts.)
const NRG_SYSTEM_FIELDS = new Set([
  "errorPort",
  "completePort",
  "statusPort",
  "validateInput",
  "validateInputTypes",
  "validateOutput",
  "validateOutputs",
  "validateOutputTypes",
  "outputReturnProperty",
  "outputReturnProperties",
  "outputContextMode",
  "outputContextModes",
  // Flow-author data-validation schema overrides (per IONodeConfig) — system
  // fields, not user Properties. Previously omitted, so they leaked into the
  // generated help table.
  "inputSchema",
  "outputSchemas",
]);

/** Fields hidden from the rendered property tables (Node-RED + nrg system). */
function isHiddenField(name: string): boolean {
  return SKIP_FIELDS.has(name) || NRG_SYSTEM_FIELDS.has(name);
}

interface SchemaSectionOptions {
  title: string;
  /** Optional: type-driven sections (input/output) render from `typeFields`
   * alone; the schema, when present, only enriches config/credentials/settings. */
  schema?: any;
  t: HelpTranslations;
  labels?: Record<string, string>;
  heading?: string;
  includeDefault?: boolean;
  /** $id → { prop: typeText }, recovered from source Unsafe<T>() args. */
  unsafeTypes?: UnsafeTypeMap;
  /**
   * The role's TypeScript fields (name/type/optional). When present, they are
   * the source of truth for which rows exist and the Type column; the schema
   * (if any) only enriches each field with default/description/constraints.
   */
  typeFields?: NodeFieldInfo[];
}

function generateSchemaSection(options: SchemaSectionOptions): string {
  const {
    title,
    schema,
    t,
    labels,
    heading = "###",
    includeDefault = true,
    unsafeTypes,
    typeFields,
  } = options;

  // Rows come from the TS types when available (source of truth — works even
  // with no schema), otherwise from the schema properties.
  if (!typeFields?.length && !schema?.properties) return "";

  const parsed = unsafeTypes?.get(schema?.$id);
  const required = new Set<string>(schema?.required ?? []);
  const rows = typeFields?.length
    ? typeFields
        .filter((f) => !isHiddenField(f.name))
        .map((f) =>
          buildPropertyRow(
            f.name,
            schema?.properties?.[f.name],
            !f.optional,
            labels?.[f.name],
            parsed?.[f.name],
            f.type,
          ),
        )
    : Object.entries(schema.properties)
        .filter(([key]) => !isHiddenField(key))
        .map(([key, propSchema]) =>
          buildPropertyRow(
            key,
            propSchema as any,
            required.has(key),
            labels?.[key],
            parsed?.[key],
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

/**
 * Render a role that is either an object (a field table) or a primitive/union
 * (a single typed line). Returns "" when there is nothing to show.
 */
function roleSection(
  title: string,
  role: NodeRoleType | undefined,
  t: HelpTranslations,
  opts: {
    schema?: any;
    labels?: Record<string, string>;
    heading?: string;
    includeDefault?: boolean;
  } = {},
): string {
  if (!role) return "";
  if (role.fields.length) {
    return generateSchemaSection({
      title,
      schema: opts.schema,
      typeFields: role.fields,
      t,
      labels: opts.labels,
      heading: opts.heading,
      includeDefault: opts.includeDefault ?? false,
    });
  }
  // Primitive / union type — no members to table.
  const level = (opts.heading ?? "###").length;
  return `<h${level}>${title}</h${level}>\n<p><code>${role.text}</code></p>\n`;
}

/**
 * A compact table of system-level capabilities — the built-in lifecycle ports
 * and whether the node exposes per-port customization of output context / return
 * property. These are nrg/framework features that don't belong in the user
 * Properties table but let a reader (or an AI indexing these docs for
 * flow-building) see how the node wires and behaves at a glance. IO nodes only —
 * config nodes have no ports. (Port counts live in the Input/Output sections;
 * per-boundary Validate Data / Validate Types is shown there, not here.)
 *
 * Row VALUES are canonical (`error`/`complete`/`status`, `true`/`false`) so they
 * stay stable across locales and read consistently for retrieval.
 */
function generateCapabilitiesSection(
  def: any,
  nodeTypes: NodeTypeInfo | undefined,
  t: HelpTranslations,
): string {
  if (nodeTypes?.kind === "config" || def.category === "config") return "";

  const hasInput = (def.inputs ?? 0) > 0 || !!nodeTypes?.input;
  const outputCount =
    nodeTypes?.outputs?.length ??
    (typeof def.outputs === "number" ? def.outputs : 0);

  // A node with no ports at all isn't a wireable message node — nothing to say.
  if (!hasInput && outputCount === 0) return "";

  // Whether the node's config exposes the per-port output-context / return-
  // property settings (see the nrg system config fields).
  const props = def.configSchema?.properties ?? {};
  const bool = (v: unknown) => (v ? "true" : "false");

  const rows: [string, string][] = [
    [t.capabilities.lifecyclePorts, "error, complete, status"],
    [t.capabilities.customOutputContext, bool(props.outputContextModes)],
    [t.capabilities.customOutputProperty, bool(props.outputReturnProperties)],
  ];

  const body = rows
    .map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`)
    .join("\n");
  return (
    `<h3>${t.sections.capabilities}</h3>\n` +
    `<div style="overflow-x:auto">\n` +
    `<table width="100%" style="min-width:500px">\n<tbody>\n${body}\n</tbody>\n</table>\n</div>\n`
  );
}

function generateHelpDoc(
  nodeClass: any,
  labels: NodeLabels,
  t: HelpTranslations,
  unsafeTypes?: UnsafeTypeMap,
  nodeTypes?: NodeTypeInfo,
): string {
  const lines: string[] = [];

  if (labels.description) {
    lines.push(`<p>${labels.description}</p>`);
  }

  const configSection = generateSchemaSection({
    title: t.sections.properties,
    schema: nodeClass.configSchema,
    typeFields: nodeTypes?.config?.fields,
    t,
    labels: labels.configs,
    unsafeTypes,
  });
  if (configSection) lines.push(configSection);

  // System capabilities (ports, lifecycle ports, validation) — right after the
  // user Properties, so the config table stays free of nrg-specific fields.
  const capabilitiesSection = generateCapabilitiesSection(
    nodeClass,
    nodeTypes,
    t,
  );
  if (capabilitiesSection) lines.push(capabilitiesSection);

  const credsSection = generateSchemaSection({
    title: t.sections.credentials,
    schema: nodeClass.credentialsSchema,
    typeFields: nodeTypes?.credentials?.fields,
    t,
    labels: labels.credentials,
    unsafeTypes,
  });
  if (credsSection) lines.push(credsSection);

  // Settings — node-level configuration (RED.settings)
  const settingsSection = nodeTypes?.settings
    ? roleSection(t.sections.settings, nodeTypes.settings, t, {
        schema: nodeClass.settingsSchema,
        includeDefault: true,
      })
    : generateSchemaSection({
        title: t.sections.settings,
        schema: nodeClass.settingsSchema,
        t,
      });
  if (settingsSection) lines.push(settingsSection);

  // Input — no Default column
  if (nodeTypes?.input) {
    const inputSection = generateSchemaSection({
      title: t.sections.input,
      typeFields: nodeTypes.input.fields,
      t,
      labels: labels.input,
      includeDefault: false,
      unsafeTypes,
    });
    if (inputSection) lines.push(inputSection);
  }

  // Output(s) — type-driven (shape-aware) from the node's Output generic.
  if (nodeTypes?.outputs?.length) {
    const ports = nodeTypes.outputs;
    if (ports.length === 1 && ports[0].name === undefined) {
      const section = roleSection(t.sections.output, ports[0].role, t, {
        labels: labels.outputs?.[0],
      });
      if (section) lines.push(section);
    } else {
      const portSections = ports
        .map((port, i) => {
          const title = port.name ?? `${t.sections.port} ${i + 1}`;
          const portLabels = port.name
            ? (labels.outputs as any)?.[port.name]
            : labels.outputs?.[i];
          return roleSection(title, port.role, t, {
            labels: portLabels,
            heading: "####",
          });
        })
        .filter(Boolean);
      if (portSections.length) {
        lines.push(
          `<h3>${t.sections.outputs}</h3>\n${portSections.join("\n")}`,
        );
      }
    }
  }

  // Complete port — carries the value returned from input().
  const completeSection = roleSection(
    t.sections.complete,
    nodeTypes?.complete,
    t,
  );
  if (completeSection) lines.push(completeSection);

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
  const { outDir, localesOutDir, docsDir, labelsDir, srcDir } = options;

  return {
    name: "vite-plugin-node-red:client:help-generator",
    apply: "build",
    enforce: "post",

    async closeBundle() {
      // Generate help from the node definitions the server build already
      // extracted (node-defs.json) — NOT by re-importing the built server
      // bundle. A production build rewrites that bundle's imports to
      // @bonsae/nrg-runtime (a publish-only package absent at author build
      // time), so importing it throws MODULE_NOT_FOUND and would silently drop
      // every node's help. The JSON carries `type` + the config/credentials/
      // settings schemas — the schema fields generateHelpDoc reads (input/output
      // sections come from the TS types). (Server and client share this outDir.)
      const defsFile = nodeDefsPath(outDir);
      let nodeDefs: any[];
      try {
        const payload = JSON.parse(fs.readFileSync(defsFile, "utf-8"));
        nodeDefs = Object.values(payload?.definitions ?? {});
      } catch (error) {
        logger.warn(
          `help generation skipped: could not read node definitions at ${defsFile} ` +
            `(${error instanceof Error ? error.message : String(error)}). ` +
            `Node help docs will be empty.`,
        );
        return;
      }

      const unsafeTypes = srcDir ? extractUnsafeTypes(srcDir) : undefined;

      // Per-node TypeScript type info (source of truth for docs) the server
      // build extracted. Optional — absent in dev, where docs fall back to the
      // schema-derived Type column.
      let nodeTypesByType: Record<string, NodeTypeInfo> = {};
      try {
        nodeTypesByType = JSON.parse(
          fs.readFileSync(nodeTypesPath(outDir), "utf-8"),
        );
      } catch {
        // No node-types.json — schema-driven fallback.
      }

      const helpByLang = new Map<string, string[]>();

      for (const def of nodeDefs) {
        const type = def.type;
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
          const content = generateHelpDoc(
            def,
            labels,
            t,
            unsafeTypes,
            nodeTypesByType[type],
          );
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
  loadNodeLabels,
  discoverLanguages,
};
export type {
  HelpGeneratorOptions,
  PropertyRow,
  SchemaSectionOptions,
  NodeLabels,
};
