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
  return function (this: NodeRedNode, index: number) {
    return resolveI18n(
      this,
      `${type}.inputLabels.${index}`,
      `${type}.inputLabels`,
    );
  };
}

function createDefaultOutputLabels(
  type: string,
  outputPortNames: string[] | undefined,
  hasBuiltinPorts: boolean,
  baseOutputs: number,
) {
  return function (this: NodeRedNode, index: number) {
    if (outputPortNames && index < outputPortNames.length) {
      return outputPortNames[index];
    }
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
    return resolveI18n(
      this,
      `${type}.outputLabels.${index}`,
      `${type}.outputLabels`,
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
