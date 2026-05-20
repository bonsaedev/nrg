import { Node } from "./nodes";
import type { NodeConstructor } from "./nodes/types";
import type { RED } from "./types";
import { initValidator } from "./validation";
import { initRoutes } from "./api";
import { NrgError } from "../errors";

/**
 * Registers a custom node with Node-RED.
 *
 * @param RED - The Node-RED runtime API object
 * @param NodeClass - A node class extending Node, IONode, or ConfigNode
 * @throws If NodeClass does not extend Node
 * @throws If NodeClass.type is not defined
 */
async function registerType(RED: RED, NodeClass: NodeConstructor) {
  RED.log.debug(`Registering Type: ${NodeClass.type}`);

  if (!(NodeClass.prototype instanceof Node)) {
    throw new NrgError(
      `${NodeClass.name} must extend IONode or ConfigNode classes`,
    );
  }

  if (!NodeClass.type) {
    throw new NrgError("type must be provided when registering the node");
  }

  await NodeClass.register(RED);
  RED.log.debug(`Type registered: ${NodeClass.type}`);
}

type RegistrationFunction = ((RED: RED) => Promise<void>) & {
  nodes: NodeConstructor[];
};

/**
 * Registers multiple node classes with Node-RED.
 *
 * Returns a Node-RED package function that Node-RED calls with the RED
 * runtime object when loading the package.
 *
 * @param nodes - Array of node classes to register
 */
function registerTypes(nodes: NodeConstructor[]): RegistrationFunction {
  const fn: RegistrationFunction = Object.assign(
    async function (RED: RED) {
      initValidator(RED);
      initRoutes(RED);
      try {
        RED.log.info("Registering node types in series");
        for (const NodeClass of nodes) {
          await registerType(RED, NodeClass);
        }
        RED.log.info("All node types registered in series");
      } catch (error) {
        RED.log.error("Error registering node types:", error);
        throw error;
      }
    },
    { nodes },
  );
  return fn;
}

export { registerType, registerTypes };
