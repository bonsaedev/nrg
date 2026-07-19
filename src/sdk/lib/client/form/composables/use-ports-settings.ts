import { type JSONSchemaType } from "ajv";
import { computed, inject } from "vue";
import { typeCheckEnabled } from "../../wire-check/availability";
import type { NodeFeatures, NodeRedNode } from "../../types";
import {
  outputRows as computeOutputRows,
  acceptsInputSchema as computeAcceptsInputSchema,
  hasOutputSchemas as computeHasOutputSchemas,
  validateOutputFor as computeValidateOutputFor,
  outputSchemaFor as computeOutputSchemaFor,
  inputSchemaValue as computeInputSchemaValue,
} from "./ports-logic";

type OpenSchemaTray = (
  title: string,
  value: string,
  onSave: (value: string) => void,
) => void;

/**
 * Moves the entire reactive logic of the framework "Ports Settings" UI out of
 * the components. Every subsection component (Input, Outputs, Lifecycle) and the
 * thin shell call this and destructure the members they need; they all inject
 * the SAME node/errors/features, so setters mutate the shared `localNode` and
 * children read the shared `errors`.
 */
function usePortsSettings() {
  const localNode = inject<NodeRedNode>("__nrg_form_node")!;
  const schema = inject<JSONSchemaType<any>>("__nrg_form_schema")!;
  const errors = inject<Record<string, string>>("__nrg_form_errors")!;
  const features = inject<NodeFeatures>("__nrg_features")!;
  const openSchemaTray = inject<OpenSchemaTray>("__nrg_open_schema_tray")!;

  /**
   * Whether THIS node offers input/output type-checking. The build injects the
   * `validateInputTypes` / `validateOutputTypes` default only for nodes with a
   * typed input / typed outputs, so its presence on the node definition is the
   * node's opt-in. The Validate Types column renders only when the node offers
   * it AND the type-check plugin is installed ({@link typeCheckEnabled}).
   */
  const supportsInputTypeValidation = computed(
    (): boolean => localNode._def?.defaults?.validateInputTypes !== undefined,
  );
  const supportsOutputTypeValidation = computed(
    (): boolean => localNode._def?.defaults?.validateOutputTypes !== undefined,
  );
  /**
   * Whether this node accepts per-port output DATA-VALIDATION schema overrides
   * — true when its config schema declares `outputSchemas`. Renders the Schema
   * column; a port is editable only when it has an author default (see
   * {@link authorOutputSchemaDefaults}) AND its Validate Data toggle is on.
   */
  const hasOutputSchemas = computed((): boolean =>
    computeHasOutputSchemas(schema),
  );
  /** Whether this node accepts an input DATA-VALIDATION schema override — true
   * when its config schema declares `inputSchema`. Renders the input Schema
   * button (enabled when the input's Validate Data toggle is on). */
  const acceptsInputSchema = computed((): boolean =>
    computeAcceptsInputSchema(schema),
  );
  const hasErrorPort = computed(
    (): boolean => schema?.properties?.errorPort !== undefined,
  );
  const hasCompletePort = computed(
    (): boolean => schema?.properties?.completePort !== undefined,
  );
  const hasStatusPort = computed(
    (): boolean => schema?.properties?.statusPort !== undefined,
  );
  const hasBuiltinPorts = computed(
    (): boolean =>
      hasErrorPort.value || hasCompletePort.value || hasStatusPort.value,
  );
  /**
   * The Validate Data column / per-port Schema button. The framework merges
   * `outputSchemas` into every IONode, so this is true whenever the node has
   * output ports — data validation is a framework control that always renders.
   */
  const hasOutputValidation = computed((): boolean => hasOutputSchemas.value);
  /**
   * Base output ports to render in the Outputs table. Reactive: a node with
   * dynamic outputs updates `localNode.outputs` (e.g. from a config field), so
   * the table grows/shrinks with it. The base count is the total minus the
   * enabled lifecycle ports; labels + descriptions reuse the static
   * `features.outputPorts` when present, otherwise fall back.
   */
  const outputRows = computed(
    (): { index: number; label: string; description: string }[] =>
      computeOutputRows(localNode, features),
  );
  /**
   * Show the Outputs subsection whenever the node has output ports (topology
   * from its TYPES). The framework injects every per-port control (Validate
   * Data, Data Schema) into every IONode, so a node with output ports always
   * has something to configure.
   */
  const showOutputs = computed((): boolean => outputRows.value.length > 0);
  const showPortsSettings = computed(
    (): boolean =>
      features.hasInput || showOutputs.value || hasBuiltinPorts.value,
  );
  /**
   * Label for the single input port, resolved from the node's i18n catalog
   * (`input.label`) — mirrors createDefaultInputLabels. Falls back to "Input"
   * since there is only ever one input port.
   */
  const inputLabel = computed((): string =>
    resolveLabel("input.label", "Input"),
  );

  function resolveLabel(key: string, fallback: string): string {
    const fullKey = `${localNode.type}.${key}`;
    const resolved = localNode._(fullKey);
    if (resolved && resolved !== fullKey && resolved !== key) {
      return resolved;
    }
    return fallback;
  }

  function docsUrl(path: string): string {
    return `https://bonsaedev.github.io/nrg${path}`;
  }

  function recalculateOutputs() {
    // Base = the node's STATIC output ports (topology). NOT `_def.outputs`: that
    // already bakes in every default-ON lifecycle port (see
    // computeBuiltinPortOutputs), so adding the enabled ports to it double-counts
    // a default-on port (e.g. job-runner's `completePort: true`) and spawns a
    // phantom base port on every toggle. `features.outputPorts` is exactly the
    // base count, excluding lifecycle ports.
    let count = features.outputPorts.length;
    if (localNode.errorPort) count++;
    if (localNode.completePort) count++;
    if (localNode.statusPort) count++;
    localNode.outputs = count;
  }

  function validateOutputFor(index: number): boolean {
    return computeValidateOutputFor(localNode, index);
  }

  function setValidateOutput(index: number, checked: boolean) {
    localNode.validateOutputs = {
      ...(localNode.validateOutputs ?? {}),
      [index]: checked,
    };
  }

  function validateOutputTypesFor(index: number): boolean {
    return localNode.validateOutputTypes?.[index] ?? false;
  }

  function setValidateOutputTypes(index: number, checked: boolean) {
    localNode.validateOutputTypes = {
      ...(localNode.validateOutputTypes ?? {}),
      [index]: checked,
    };
  }

  /** The effective schema string for a port: the flow-author override, else the
   * author default, else empty. */
  function outputSchemaFor(index: number): string {
    return computeOutputSchemaFor(localNode, schema, index);
  }

  function setOutputSchema(index: number, value: string) {
    const next = { ...(localNode.outputSchemas ?? {}) };
    if (value.trim()) {
      next[index] = value;
    } else {
      delete next[index];
    }
    localNode.outputSchemas = next;
  }

  /** Open a Monaco (JSON) tray to edit this port's validation schema, seeded
   * from the effective value and saved back to config on Done. */
  function openOutputSchemaEditor(index: number) {
    const title = `${resolveLabel("portSettings.outputsTable.schema", "Data Schema")} — ${
      outputRows.value[index]?.label ?? `Output ${index}`
    }`;
    openSchemaTray(title, outputSchemaFor(index), (value) =>
      setOutputSchema(index, value),
    );
  }

  /** The effective input schema string: the flow-author override, else the
   * author default, else empty. */
  function inputSchemaValue(): string {
    return computeInputSchemaValue(localNode, schema);
  }

  function setInputSchema(value: string) {
    localNode.inputSchema = value.trim();
  }

  /** Open a Monaco (JSON) tray to edit the input's validation schema, seeded
   * from the effective value and saved back to config on Done. */
  function openInputSchemaEditor() {
    const title = `${resolveLabel("portSettings.inputsTable.schema", "Data Schema")} — ${
      inputLabel.value
    }`;
    openSchemaTray(title, inputSchemaValue(), (value) => setInputSchema(value));
  }

  return {
    // injected refs (so templates can bind them)
    localNode,
    errors,
    features,
    typeCheckEnabled,
    // computed
    showPortsSettings,
    showOutputs,
    hasBuiltinPorts,
    hasErrorPort,
    hasCompletePort,
    hasStatusPort,
    hasOutputValidation,
    hasOutputSchemas,
    acceptsInputSchema,
    supportsInputTypeValidation,
    supportsOutputTypeValidation,
    outputRows,
    inputLabel,
    // functions
    resolveLabel,
    docsUrl,
    recalculateOutputs,
    validateOutputFor,
    setValidateOutput,
    validateOutputTypesFor,
    setValidateOutputTypes,
    outputSchemaFor,
    setOutputSchema,
    inputSchemaValue,
    setInputSchema,
    openOutputSchemaEditor,
    openInputSchemaEditor,
  };
}

export { usePortsSettings };
