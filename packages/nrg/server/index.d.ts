import { Node } from "./nodes";
import { type RED } from "./types";
type AnyNodeClass = (abstract new (...args: any[]) => Node) & Partial<typeof Node>;
/**
 * Registers a custom node with Node-RED.
 *
 * @param RED - The Node-RED runtime API object
 * @param NodeClass - A node class extending Node, IONode, or ConfigNode
 * @throws If NodeClass does not extend Node
 * @throws If NodeClass.type is not defined
 */
declare function registerType(RED: RED, NodeClass: AnyNodeClass): Promise<void>;
/**
 * Registers multiple node classes with Node-RED in sequence.
 *
 * @param RED - The Node-RED runtime API object
 * @param nodeClasses - Array of node classes to register
 */
declare function registerTypes(RED: RED, nodeClasses: AnyNodeClass[]): Promise<void>;
type NodeRedPackageFunction = ((RED: RED) => Promise<void>) & {
    nodes: AnyNodeClass[];
};
declare function defineNodeRedPackage(options: {
    nodes: AnyNodeClass[];
}): NodeRedPackageFunction;
export { defineNodeRedPackage, registerType, registerTypes };
