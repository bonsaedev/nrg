import type { Plugin } from "vite";
import fs from "node:fs";
import path from "node:path";
import { getHelpTranslations, type HelpTranslations } from "./help-i18n";
import { extractUnsafeTypes, type UnsafeTypeMap } from "./unsafe-types";
import type {
  NodeTypeInfo,
  NodeFieldInfo,
  NodeRoleType,
  NodeOutputPort,
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
  if (schema?.["x-nrg-node-type"]) {
    // NodeRef: the field's resolved config type is the referenced node instance
    // (`tsType`, e.g. `SalesforceConnection`, extracted by following imports);
    // the source-recovered arg is the fallback when there's no extracted type.
    // Render it as `NodeRef<Instance>("node-type")` — the plain instance name
    // would hide that it's a reference.
    const arg = tsType || parsedType;
    type = arg
      ? `NodeRef<${arg}>("${schema["x-nrg-node-type"]}")`
      : `NodeRef("${schema["x-nrg-node-type"]}")`;
  } else if (tsType) {
    // The node's TypeScript type is the source of truth — already `TypedInput<T>`,
    // `Array<…>`, a union, etc.
    type = tsType;
  } else if (schema?.["x-nrg-typed-input"]) {
    // No extracted TS type (e.g. no node-types.json in dev) — recover `T` from
    // the source `TypedInput<T>()` arg when possible, else a bare TypedInput.
    type = parsedType ? `TypedInput<${parsedType}>` : "TypedInput";
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
  // `node-id` is NodeRef's internal format (already conveyed by `NodeRef<…>("…")`);
  // `password` is a credential concern — neither belongs in the Type column.
  if (
    schema?.format &&
    schema.format !== "password" &&
    schema.format !== "node-id"
  )
    constraints.push(`format: ${schema.format}`);
  // A TypedInput field can restrict its input modes (`typedInputTypes` in the
  // form metadata) — show them alongside the other constraints so the reader
  // knows what's allowed, e.g. `TypedInput<string> [types: str, jsonata, msg]`.
  const inputTypes = schema?.["x-nrg-form"]?.typedInputTypes;
  if (Array.isArray(inputTypes) && inputTypes.length)
    constraints.push(`types: ${inputTypes.join(", ")}`);
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
  /** Show the Description column. Type-driven sections (input/output) have no
   * schema and therefore no descriptions, so they turn it off. Default `true`. */
  includeDescription?: boolean;
  /** $id → { prop: typeText }, recovered from source Unsafe<T>() args. */
  unsafeTypes?: UnsafeTypeMap;
  /**
   * The role's TypeScript fields (name/type/optional). When present, they are
   * the source of truth for which rows exist and the Type column; the schema
   * (if any) only enriches each field with default/description/constraints.
   */
  typeFields?: NodeFieldInfo[];
}

/**
 * Escape text for an HTML cell. Node-RED renders node help as HTML, so a Type
 * like `Array<Record<string, unknown>>` or `NodeRef<Conn>("…")` would otherwise
 * have its `<…>` eaten as tags (e.g. `Array<Record<…>>` → `Array>`).
 */
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * The property `<table>` (no heading) for a set of rows. Columns are built
 * dynamically so a flag (labels / default / description) just adds or drops a
 * column. Cell values that carry TS types or user text are HTML-escaped so
 * generics (`<…>`) aren't eaten as tags; headers and yes/no are canonical.
 */
function buildPropertyTable(
  rows: PropertyRow[],
  t: HelpTranslations,
  includeDefault: boolean,
  includeDescription: boolean,
): string {
  const hasLabels = rows.some((r) => r.label);
  const c = t.columns;
  const v = t.values;
  type Col = {
    header: string;
    cell: (r: PropertyRow) => string;
    width?: string;
  };
  const cols: Col[] = [];
  if (hasLabels)
    cols.push({ header: c.label, cell: (r) => escapeHtml(r.label) });
  cols.push({ header: c.property, cell: (r) => escapeHtml(r.name) });
  cols.push({ header: c.type, cell: (r) => escapeHtml(r.type) });
  cols.push({ header: c.required, cell: (r) => (r.required ? v.yes : v.no) });
  if (includeDefault)
    cols.push({
      header: c.default,
      cell: (r) =>
        r.defaultVal ? `<code>${escapeHtml(r.defaultVal)}</code>` : "",
    });
  if (includeDescription)
    cols.push({
      header: c.description,
      cell: (r) => escapeHtml(r.description),
      width: hasLabels ? "35%" : "40%",
    });

  const headerCells = cols
    .map(
      (col) =>
        `<th${col.width ? ` style="width:${col.width}"` : ""}>${col.header}</th>`,
    )
    .join("");
  const rowFn = (r: PropertyRow) =>
    `<tr>${cols.map((col) => `<td>${col.cell(r)}</td>`).join("")}</tr>`;
  const tableRows = rows.map(rowFn).join("\n");

  return `<div style="overflow-x:auto">
<table width="100%" style="min-width:500px">
<thead><tr>${headerCells}</tr></thead>
<tbody>
${tableRows}
</tbody>
</table>
</div>`;
}

/**
 * A one-row `Type` table (no heading) for a union/primitive value — reads
 * consistently with the field tables (a bare `<code>` line looks broken).
 */
function buildTypeTable(text: string, t: HelpTranslations): string {
  return (
    `<div style="overflow-x:auto">\n` +
    `<table width="100%" style="min-width:500px">\n` +
    `<thead><tr><th>${t.columns.type}</th></tr></thead>\n` +
    `<tbody>\n<tr><td>${escapeHtml(text)}</td></tr>\n</tbody>\n` +
    `</table>\n</div>`
  );
}

function generateSchemaSection(options: SchemaSectionOptions): string {
  const {
    title,
    schema,
    t,
    labels,
    heading = "###",
    includeDefault = true,
    includeDescription = true,
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

  const table = buildPropertyTable(rows, t, includeDefault, includeDescription);
  const headingLevel = heading.length; // "###" = 3, "####" = 4
  const tag = `h${headingLevel}`;
  return `<${tag}>${title}</${tag}>\n${table}\n`;
}

/** One port's label file entry: its display label + a human description of what
 * it carries (mirrors the `port` $def in labels.schema.json). */
interface PortLabels {
  label?: string;
  description?: string;
}

interface NodeLabels {
  description?: string;
  configs?: Record<string, string>;
  credentials?: Record<string, string>;
  /** The single input port: its label + payload-property labels. */
  input?: PortLabels;
  /** Output ports: an object keyed by port name (named) or an array in tuple
   * order (positional). Each entry gives the port's label + property labels. */
  outputs?: PortLabels[] | Record<string, PortLabels>;
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

/** Resolve an output port's label-file entry — by name for a named-port object,
 * by index for a positional array. */
function outputPortLabels(
  outputs: PortLabels[] | Record<string, PortLabels> | undefined,
  port: NodeOutputPort,
  index: number,
): PortLabels | undefined {
  if (!outputs) return undefined;
  if (Array.isArray(outputs)) return outputs[index];
  return port.name ? outputs[port.name] : undefined;
}

/** Role type texts that carry no useful documentation — a section is skipped. */
const VACUOUS_ROLE_TYPES = new Set([
  "any",
  "unknown",
  "void",
  "never",
  "undefined",
  "{}",
]);

/**
 * Render the type-driven Settings section: an object role → a field table (with
 * defaults), a primitive/union role → a one-row Type table. The role is always
 * present and non-vacuous here (the extractor only sets `nodeTypes.settings` for
 * a documentable type), so there is no empty/vacuous case to guard.
 */
function settingsRoleSection(
  role: NodeRoleType,
  schema: any,
  t: HelpTranslations,
): string {
  if (role.fields.length) {
    return generateSchemaSection({
      title: t.sections.settings,
      schema,
      typeFields: role.fields,
      t,
      includeDefault: true,
    });
  }
  return `<h3>${escapeHtml(t.sections.settings)}</h3>\n${buildTypeTable(role.text.trim(), t)}\n`;
}

/** One row in a ports table: the port's display name, its message type rendered
 * inline, and an optional human description (from the label file). */
interface PortRow {
  name: string;
  type: string;
  description?: string;
}

/**
 * Render a ports table — ONE row per port, never a row per payload property. Each
 * row is `Port | Type`, with the message type shown inline (an object as its
 * `{ … }` shape); a Description column is added only when at least one port
 * carries a `description` from the label file. Used for both the single Input
 * port and the Outputs, so they read the same way. Returns "" when there are no
 * rows (every port vacuous). The heading is HTML-escaped (a label string may
 * carry `<`).
 */
function buildPortsTable(
  heading: string,
  rows: PortRow[],
  t: HelpTranslations,
): string {
  if (rows.length === 0) return "";
  const hasDescription = rows.some((r) => r.description);
  const descHead = hasDescription
    ? `<th>${escapeHtml(t.columns.description)}</th>`
    : "";
  const body = rows
    .map(
      (r) =>
        `<tr><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.type)}</td>` +
        (hasDescription ? `<td>${escapeHtml(r.description ?? "")}</td>` : "") +
        `</tr>`,
    )
    .join("\n");
  return (
    `<h3>${escapeHtml(heading)}</h3>\n` +
    `<div style="overflow-x:auto">\n` +
    `<table width="100%" style="min-width:500px">\n` +
    `<thead><tr><th>${escapeHtml(t.sections.port)}</th><th>${escapeHtml(t.columns.type)}</th>${descHead}</tr></thead>\n` +
    `<tbody>\n${body}\n</tbody>\n` +
    `</table>\n</div>`
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
    // Escaped like every other label-file string — a `<`/`&` in the summary
    // (e.g. "records < 200") must not be eaten as HTML.
    lines.push(`<p>${escapeHtml(labels.description)}</p>`);
  }

  const configSection = generateSchemaSection({
    title: t.sections.configuration,
    schema: nodeClass.configSchema,
    typeFields: nodeTypes?.config?.fields,
    t,
    labels: labels.configs,
    unsafeTypes,
  });
  if (configSection) lines.push(configSection);

  const credsSection = generateSchemaSection({
    title: t.sections.credentials,
    schema: nodeClass.credentialsSchema,
    typeFields: nodeTypes?.credentials?.fields,
    t,
    labels: labels.credentials,
    unsafeTypes,
  });
  if (credsSection) lines.push(credsSection);

  // Settings — node-level configuration (RED.settings). Type-driven when the
  // node declares a Settings type, else schema-driven.
  const settingsSection = nodeTypes?.settings
    ? settingsRoleSection(nodeTypes.settings, nodeClass.settingsSchema, t)
    : generateSchemaSection({
        title: t.sections.settings,
        schema: nodeClass.settingsSchema,
        t,
      });
  if (settingsSection) lines.push(settingsSection);

  // Input — type-driven, single port → ONE row (Port | Type | Description). The
  // type renders inline; the label + description come from the label file's
  // `input` entry. Skipped when the input carries nothing to document
  // (any/unknown/void).
  if (nodeTypes?.input) {
    const type = nodeTypes.input.text.trim();
    if (!VACUOUS_ROLE_TYPES.has(type)) {
      const inputSection = buildPortsTable(
        t.sections.input,
        [
          {
            name: labels.input?.label ?? t.sections.input,
            type,
            description: labels.input?.description,
          },
        ],
        t,
      );
      if (inputSection) lines.push(inputSection);
    }
  }

  // Outputs — ONE row per port (Port | Type | Description). The type renders
  // inline (an object as its `{ … }` shape, never exploded into per-property
  // rows), so a single object output, a union, and a multi-port node all read
  // the same way. Label + description come from the label file's `outputs` entry.
  if (nodeTypes?.outputs?.length) {
    const rows = nodeTypes.outputs
      .map((port, i): PortRow | undefined => {
        const type = port.role.text.trim();
        if (VACUOUS_ROLE_TYPES.has(type)) return undefined;
        const entry = outputPortLabels(labels.outputs, port, i);
        return {
          name: entry?.label ?? port.name ?? `${t.sections.port} ${i + 1}`,
          type,
          description: entry?.description,
        };
      })
      .filter((r): r is PortRow => r !== undefined);
    const outputsTable = buildPortsTable(t.sections.outputs, rows, t);
    if (outputsTable) {
      lines.push(outputsTable);
      // Explain the wire shape the inline types don't reveal: value under the
      // return property, plus the source/input provenance keys.
      lines.push(`<p><small>${t.notes.outputEnvelope}</small></p>`);
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
