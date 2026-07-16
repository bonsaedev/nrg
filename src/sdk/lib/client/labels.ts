import type { NodeRedNode } from "./types";

function resolveI18n(node: NodeRedNode, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const resolved = node._(key);
    if (resolved && resolved !== key) return resolved;
  }
  return undefined;
}

function createDefaultLabel(type: string) {
  return function (this: NodeRedNode) {
    if (this.name) return this.name;
    return resolveI18n(this, `${type}.label`) ?? type;
  };
}

function createDefaultPaletteLabel(type: string) {
  return function (this: NodeRedNode) {
    return resolveI18n(this, `${type}.paletteLabel`, `${type}.label`) ?? type;
  };
}

function createDefaultInputLabels(type: string) {
  // Node-RED's single input port. Its display label comes from the `input.label`
  // entry in the node's label catalog; unset → undefined (no canvas label).
  return function (this: NodeRedNode, _index: number) {
    return resolveI18n(this, `${type}.input.label`);
  };
}

function createDefaultOutputLabels(
  type: string,
  outputPortNames: string[] | undefined,
  hasBuiltinPorts: boolean,
  baseOutputs: number,
) {
  return function (this: NodeRedNode, index: number) {
    if (hasBuiltinPorts) {
      let extraIdx = baseOutputs;
      if (this.errorPort) {
        if (index === extraIdx) return "Error";
        extraIdx++;
      }
      if (this.completePort) {
        if (index === extraIdx) return "Complete";
        extraIdx++;
      }
      if (this.statusPort) {
        if (index === extraIdx) return "Status";
        extraIdx++;
      }
    }
    // The port's display label lives at `outputs.<name>.label` (named ports) or
    // `outputs.<index>.label` (positional). The port NAME is used ONLY to build
    // the lookup key — never returned as the visible label — so an un-localized
    // node shows no canvas label rather than leaking the raw type name.
    const name = outputPortNames?.[index];
    return resolveI18n(
      this,
      ...(name ? [`${type}.outputs.${name}.label`] : []),
      `${type}.outputs.${index}.label`,
    );
  };
}

export {
  resolveI18n,
  createDefaultLabel,
  createDefaultPaletteLabel,
  createDefaultInputLabels,
  createDefaultOutputLabels,
};
