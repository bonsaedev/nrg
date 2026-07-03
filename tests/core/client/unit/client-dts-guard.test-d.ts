import {
  defineNode,
  registerType,
  registerTypes,
} from "@/core/client/registration";
import type { NodeDefinition } from "@/core/client/types";

// The published `@bonsae/nrg/client` d.ts is generated from client/public.ts,
// but three editor-runtime functions can't be generated there without dragging
// the .vue editor internals into the public surface — so build/index.ts
// hand-appends their declarations. Hand-written signatures drift silently. These
// proofs pin each one to the REAL runtime by mutual assignability: if a source
// signature changes, one direction stops compiling and tsc fails here, forcing
// the appended block in build/index.ts to be updated in lockstep.
//
// Keep these in exact sync with the appendFileSync(...) block in
// build/index.ts → generateTypes().

// export declare function defineNode<T extends NodeDefinition>(options: T): T;
const handDefineNode: <T extends NodeDefinition>(options: T) => T = defineNode;
const realDefineNode: typeof defineNode = handDefineNode;
void handDefineNode;
void realDefineNode;

// export declare function registerType(definition: NodeDefinition): Promise<void>;
const handRegisterType: (definition: NodeDefinition) => Promise<void> =
  registerType;
const realRegisterType: typeof registerType = handRegisterType;
void handRegisterType;
void realRegisterType;

// export declare function registerTypes(nodes: NodeDefinition[]): Promise<void>;
const handRegisterTypes: (nodes: NodeDefinition[]) => Promise<void> =
  registerTypes;
const realRegisterTypes: typeof registerTypes = handRegisterTypes;
void handRegisterTypes;
void realRegisterTypes;

// Negative proofs — prove the guard actually bites (not vacuously assignable).
// A wrong parameter type must be rejected under strictFunctionTypes.
// @ts-expect-error registerType takes NodeDefinition, not string
const wrongRegisterType: (definition: string) => Promise<void> = registerType;
void wrongRegisterType;
// @ts-expect-error registerTypes takes an array, not a single NodeDefinition
const wrongRegisterTypes: (node: NodeDefinition) => Promise<void> =
  registerTypes;
void wrongRegisterTypes;
