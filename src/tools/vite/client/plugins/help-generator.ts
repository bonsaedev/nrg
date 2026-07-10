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

interface NodeLabels {
  description?: string;
  configs?: Record<string, string>;
  credentials?: Record<string, string>;
  input?: Record<string, string>;
  outputs?: Record<string, string>[];
  /** Per-port domain label (Node-RED `inputLabels`) — the single input port. */
  inputLabels?: string[];
  /** Per-port domain labels (Node-RED `outputLabels`) — one per output port. */
  outputLabels?: string[];
}

/** Node-RED `inputLabels`/`outputLabels` may be a bare string (one port) or an
 * array (many) — normalize to an array so ports index into it uniformly. */
function normalizePortLabels(value: unknown): string[] | undefined {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value;
  return undefined;
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
      inputLabels: normalizePortLabels(raw.inputLabels),
      outputLabels: normalizePortLabels(raw.outputLabels),
    };
  } catch {
    return {};
  }
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
 * Render a role that is either an object (a field table) or a primitive/union
 * (a single-cell Type table). Returns "" when there is nothing to show — an
 * object with no fields, or a vacuous type like `any`/`unknown`.
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
    includeDescription?: boolean;
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
      includeDescription: opts.includeDescription ?? true,
    });
  }
  const text = role.text.trim();
  // A vacuous type (`any`/`unknown`/…) carries no useful information — skip the
  // whole section, the same way an `any` input renders nothing.
  if (VACUOUS_ROLE_TYPES.has(text)) return "";
  // A union / primitive with no members — show the type itself in a one-row
  // table so it reads consistently with the field tables.
  const level = (opts.heading ?? "###").length;
  return `<h${level}>${title}</h${level}>\n${buildTypeTable(text, t)}\n`;
}

/**
 * Render the INPUT port (a single message). Distinct from {@link roleSection}
 * because it must read as ONE message:
 *
 * - the port's domain label (`inputLabels`, e.g. "Record data") is surfaced;
 * - an object value is a field table, enriched by the default input validation
 *   schema (constraints, required, descriptions) when the author ships one;
 * - a primitive/union value renders a one-row Type table (so a non-object input,
 *   which the old schema-only path dropped, is documented too).
 *
 * The heading text is HTML-escaped (a label-file string may carry `<`). Returns
 * "" when the port carries nothing to document (any/unknown/void).
 */
function messagePortSection(
  title: string,
  role: NodeRoleType,
  t: HelpTranslations,
  opts: {
    /** Domain label for the whole port (from `inputLabels`). */
    portLabel?: string;
    /** Per-property labels for an object value (from the `input` map). */
    fieldLabels?: Record<string, string>;
    heading?: string;
    /**
     * The author's default data-validation schema for this port (parsed from the
     * `inputSchema` config default). When present, each field's matching
     * `properties[name]` enriches the type with runtime constraints
     * (min/max/pattern/format/required) and a description — the contract the TS
     * generics don't carry. Defaults are NOT shown: data-plane validation is a
     * pure predicate, so they're never injected into a message.
     */
    schema?: any;
  } = {},
): string {
  const level = (opts.heading ?? "###").length;
  const head = `<h${level}>${escapeHtml(title)}</h${level}>\n`;
  const labelLine = opts.portLabel
    ? `<p><strong>${escapeHtml(opts.portLabel)}</strong></p>\n`
    : "";

  if (role.fields.length) {
    const rows = role.fields
      .filter((f) => !isHiddenField(f.name))
      .map((f) =>
        buildPropertyRow(
          f.name,
          opts.schema?.properties?.[f.name],
          !f.optional,
          opts.fieldLabels?.[f.name],
          undefined,
          f.type,
        ),
      );
    if (rows.length === 0) return "";
    // A Description column only when the validation schema supplied one — a pure
    // type has no descriptions (the reason the column was dropped originally).
    const includeDescription = rows.some((r) => r.description);
    return (
      head +
      labelLine +
      buildPropertyTable(rows, t, false, includeDescription) +
      "\n"
    );
  }

  const text = role.text.trim();
  if (VACUOUS_ROLE_TYPES.has(text)) return "";
  return head + labelLine + buildTypeTable(text, t) + "\n";
}

/**
 * Parse a serialized JSON-Schema string (an `inputSchema`/`outputSchemas` config
 * default) into an object, or `undefined` for an empty/absent/invalid value.
 */
function parseValidationSchema(value: unknown): any | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The unified OUTPUTS table: one row per output port — `Port | Type` — with the
 * value shown inline (an object as its `{ … }` shape, not exploded into a field
 * table), so a single object output, a union, and a multi-port node all read the
 * same way under one plural "Outputs" heading. A port whose value is vacuous
 * (any/unknown/void) carries nothing to document and is skipped; when none
 * remain, returns "" (no section).
 */
function buildOutputsTable(
  ports: NodeOutputPort[],
  outputLabels: string[] | undefined,
  t: HelpTranslations,
): string {
  const rows = ports
    .map((port, i) => {
      const type = port.role.text.trim();
      if (VACUOUS_ROLE_TYPES.has(type)) return undefined;
      // The port's identifier: its friendly label, else the named-port name,
      // else the positional "Port N".
      const name =
        outputLabels?.[i] ?? port.name ?? `${t.sections.port} ${i + 1}`;
      return `<tr><td>${escapeHtml(name)}</td><td>${escapeHtml(type)}</td></tr>`;
    })
    .filter((r): r is string => r !== undefined);
  if (rows.length === 0) return "";

  return (
    `<h3>${t.sections.outputs}</h3>\n` +
    `<div style="overflow-x:auto">\n` +
    `<table width="100%" style="min-width:500px">\n` +
    `<thead><tr><th>${t.sections.port}</th><th>${t.columns.type}</th></tr></thead>\n` +
    `<tbody>\n${rows.join("\n")}\n</tbody>\n` +
    `</table>\n</div>`
  );
}

/** The built-in ERROR port's fixed shape (see server ports.ts ErrorPortOutput). */
const ERROR_PORT_SHAPE =
  "{ error: { name: string; message: string; stack?: string }; source; input }";
/** The built-in STATUS port's fixed shape (see server ports.ts StatusPortOutput). */
const STATUS_PORT_SHAPE =
  '{ status: { fill?: string; shape?: "ring" | "dot"; text?: string } | string; source }';

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
    title: t.sections.properties,
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

  // The node author's default INPUT data-validation schema (a serialized
  // JSON-Schema string on the inputSchema config default). It carries the
  // runtime contract — constraints, required, per-field descriptions — the TS
  // generics don't, so it enriches the type-driven Input table. (Outputs render
  // as inline types, so their per-field schema doesn't apply there.)
  const inputValidationSchema = parseValidationSchema(
    nodeClass.configSchema?.properties?.inputSchema?.default,
  );

  // Input — type-driven, single port. Surface its domain label (`inputLabels`)
  // and render an object as a field table or a primitive/union as a Type table
  // (the old schema-only path dropped a non-object input entirely). Enriched by
  // the default input validation schema when the author ships one.
  let hasValidationSchema = false;
  if (nodeTypes?.input) {
    const inputSection = messagePortSection(
      t.sections.input,
      nodeTypes.input,
      t,
      {
        portLabel: labels.inputLabels?.[0],
        fieldLabels: labels.input,
        schema: inputValidationSchema,
      },
    );
    if (inputSection) {
      lines.push(inputSection);
      if (inputValidationSchema) hasValidationSchema = true;
    }
  }

  // Outputs — every port renders uniformly as one row (Port | Type) under a
  // single "Outputs" heading, with an object value shown inline as its shape
  // rather than exploded into a field table. A single object output, a union,
  // and a multi-port node all read the same way.
  if (nodeTypes?.outputs?.length) {
    const outputsTable = buildOutputsTable(
      nodeTypes.outputs,
      labels.outputLabels,
      t,
    );
    if (outputsTable) {
      lines.push(outputsTable);
      // Explain the wire shape the inline types don't reveal: value under the
      // return property, plus the source/input provenance keys.
      lines.push(`<p><small>${t.notes.outputEnvelope}</small></p>`);
    }
  }

  // When the Input constraints came from a default validation schema, note that
  // they are opt-in (Validate Data) and flow-author-overridable, so they don't
  // read as hard guarantees.
  if (hasValidationSchema) {
    lines.push(`<p><small>${t.notes.dataValidation}</small></p>`);
  }

  // Complete port — carries input()'s return value. Rendered like Error/Status:
  // a one-row Type table with the full message shape inline (the return value is
  // NOT exploded into a field table), so all three built-in ports read the same.
  // Only shown when input() returns a non-void value (nodeTypes.complete is set
  // only for a non-vacuous return).
  if (nodeTypes?.complete) {
    const completeShape = `{ complete: ${nodeTypes.complete.text.trim()}; source; input }`;
    lines.push(
      `<h3>${escapeHtml(t.sections.complete)}</h3>\n${buildTypeTable(completeShape, t)}`,
    );
  }

  // Built-in ERROR and STATUS ports — present on every IONode (enable via
  // config). Their shapes are framework-fixed (not type-derived), so render them
  // as static shape tables. Config nodes have no ports, so skip them.
  if (nodeTypes?.kind === "io") {
    lines.push(
      `<h3>${escapeHtml(t.sections.error)}</h3>\n${buildTypeTable(ERROR_PORT_SHAPE, t)}`,
    );
    lines.push(
      `<h3>${escapeHtml(t.sections.status)}</h3>\n${buildTypeTable(STATUS_PORT_SHAPE, t)}`,
    );
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
