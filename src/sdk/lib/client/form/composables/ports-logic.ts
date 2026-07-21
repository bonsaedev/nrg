import type { JSONSchemaType } from "ajv";
import { validateSchemaString } from "../../validation";
import type { NodeFeatures } from "../../types";
import type { NodeRedNode } from "../../node-red";

/**
 * Base output ports to render in the Outputs table. The base count is the total
 * (`node.outputs`) minus the enabled lifecycle ports when the count is
 * consistent; otherwise it falls back to the node's declared `outputs` count
 * (e.g. a flow that toggled a lifecycle port without updating `outputs`). Labels
 * reuse the static `features.outputPorts` when present, otherwise fall back to
 * `Output {index}`.
 */
function outputRows(
  node: NodeRedNode,
  features: NodeFeatures,
): { index: number; label: string; description: string }[] {
  const builtins =
    (node.errorPort ? 1 : 0) +
    (node.completePort ? 1 : 0) +
    (node.statusPort ? 1 : 0);
  const total = typeof node.outputs === "number" ? node.outputs : null;
  const base =
    total !== null && total >= builtins
      ? total - builtins
      : features.outputPorts.length;
  return Array.from({ length: base }, (_, index) => ({
    index,
    label: features.outputPorts[index]?.label ?? `Output ${index}`,
    description: features.outputPorts[index]?.description ?? "",
  }));
}

/** Whether this node accepts an input DATA-VALIDATION schema override — true
 * when its config schema declares `inputSchema`. */
function acceptsInputSchema(schema: JSONSchemaType<any>): boolean {
  return schema?.properties?.inputSchema !== undefined;
}

/** Whether this node accepts per-port output DATA-VALIDATION schema overrides —
 * true when its config schema declares `outputSchemas`. */
function hasOutputSchemas(schema: JSONSchemaType<any>): boolean {
  return schema?.properties?.outputSchemas !== undefined;
}

/** Whether a base output port's Validate Data toggle is on. */
function validateOutputFor(node: NodeRedNode, index: number): boolean {
  return node.validateOutputs?.[index] ?? false;
}

/** The effective schema string for a port: the flow-author override, else the
 * author default, else empty. */
function outputSchemaFor(
  node: NodeRedNode,
  schema: JSONSchemaType<any>,
  index: number,
): string {
  return (
    node.outputSchemas?.[index] ??
    schema?.properties?.outputSchemas?.default?.[index] ??
    ""
  );
}

/** The effective input schema string: the flow-author override, else the author
 * default, else empty. */
function inputSchemaValue(
  node: NodeRedNode,
  schema: JSONSchemaType<any>,
): string {
  return node.inputSchema ?? schema?.properties?.inputSchema?.default ?? "";
}

/**
 * Validates the flow-author per-port DATA-VALIDATION schema STRINGS (the input
 * schema and each output-port schema) so a malformed JSON Schema is caught in
 * the editor rather than at deploy time, when `input()` / `send()` first compile
 * it. Only ports whose Validate Data toggle is on are checked, since only those
 * compile at runtime. Errors are keyed like every other form error
 * (`node.inputSchema`, `node.outputSchemas.<i>`) so the message renders inline
 * and the Schema icon turns red.
 */
function computeSchemaStringErrors(
  node: NodeRedNode,
  schema: JSONSchemaType<any>,
  features: NodeFeatures,
): Record<string, string> {
  const errs: Record<string, string> = {};
  if (acceptsInputSchema(schema) && node.validateInput) {
    const msg = validateSchemaString(inputSchemaValue(node, schema));
    if (msg) errs["node.inputSchema"] = msg;
  }
  if (hasOutputSchemas(schema)) {
    for (const { index } of outputRows(node, features)) {
      if (!validateOutputFor(node, index)) continue;
      const msg = validateSchemaString(outputSchemaFor(node, schema, index));
      if (msg) errs[`node.outputSchemas.${index}`] = msg;
    }
  }
  return errs;
}

export {
  outputRows,
  acceptsInputSchema,
  hasOutputSchemas,
  validateOutputFor,
  outputSchemaFor,
  inputSchemaValue,
  computeSchemaStringErrors,
};
