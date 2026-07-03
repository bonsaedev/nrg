import { isEqual } from "es-toolkit";
import type { NodeState, NodeRedNode } from "./types";

function getNodeState(node: NodeRedNode): NodeState {
  const state: NodeState = {
    credentials: {},
  };
  Object.keys(node._def.defaults ?? {}).forEach((prop) => {
    state[prop] = node[prop];
  });
  if (node._def.credentials) {
    Object.keys(node._def.credentials).forEach((prop) => {
      state.credentials[prop] = node.credentials?.[prop];

      if (node._def.credentials[prop].type === "password") {
        state.credentials[`has_${prop}`] =
          node.credentials?.[`has_${prop}`] || false;
      }
    });
  }

  return state;
}

function getChanges(
  o: Record<any, any>,
  n: Record<any, any>,
): Record<string, any> {
  const changes: Record<string, any> = {};

  const allKeys = new Set([...Object.keys(o), ...Object.keys(n ?? {})]);
  allKeys.forEach((prop) => {
    const _o = o[prop];
    const _n = (n ?? {})[prop];

    if (!Array.isArray(_o) && typeof _o === "object" && _o !== null) {
      const _changes = getChanges(_o, _n);
      if (Object.keys(_changes).length) {
        changes[prop] = _changes;
      }
    } else if (!isEqual(_o, _n)) {
      changes[prop] = _o;
    }
  });

  return changes;
}

function applyState(target: any, source: any): void {
  for (const key of Object.keys(source)) {
    const srcVal = source[key];
    if (Array.isArray(srcVal)) {
      target[key] = [...srcVal];
    } else if (srcVal !== null && typeof srcVal === "object") {
      if (
        !target[key] ||
        typeof target[key] !== "object" ||
        Array.isArray(target[key])
      ) {
        target[key] = {};
      }
      applyState(target[key], srcVal);
    } else {
      target[key] = srcVal;
    }
  }
}

export { getNodeState, getChanges, applyState };
