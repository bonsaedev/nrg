import { getCredentialsFromSchema } from "./utils";
import { Node } from "./nodes";
import type { NodeConstructor } from "./nodes/types";
import { type RED } from "./types";
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
  const NC = NodeClass as any;
  RED.log.debug(`Registering Type: ${NC.type}`);
  if (!(NC.prototype instanceof Node)) {
    throw new NrgError(`${NC.name} must extend IONode or ConfigNode classes`);
  }

  if (!NC.type) {
    throw new NrgError("type must be provided when registering the node");
  }

  if (NC.color && !/^#[0-9A-Fa-f]{6}$/.test(NC.color)) {
    throw new NrgError(
      `Invalid color for ${NodeClass.type}: ${NC.color} color must be in hex format`,
    );
  }

  RED.nodes.registerType(
    NC.type,
    function (this: any, config: any) {
      RED.nodes.createNode(this, config);
      const node = new NC(RED, this, config, this.credentials);
      // NOTE: save node instance inside node-red's node so that the proxy can resolve it lazily.
      // Non-writable to prevent accidental clobbering by other code in the process.
      Object.defineProperty(this, "_node", {
        value: node,
        writable: false,
        configurable: false,
        enumerable: false,
      });

      // NOTE: created promise must be here because we only want it to start after the whole object creation chain has been completed: child -> IONode -> Node -> IONode -> child -> done
      const createdPromise = Promise.resolve(node.created?.()).catch(
        (error: any) => {
          this.error("Error during created hook: " + error.message);
          throw error;
        },
      );

      this.on(
        "input",
        async (
          msg: unknown,
          send: (msg: unknown) => void,
          done: (err?: Error) => void,
        ) => {
          try {
            await createdPromise;
          } catch {
            done(new Error("Node failed to initialize"));
            return;
          }

          try {
            this.log("Calling input");
            await Promise.resolve(node._input(msg, send));

            // Send to complete port if enabled
            const completeIdx = node._getCompletePortIndex();
            if (completeIdx !== null) {
              node._sendToPort(completeIdx, {
                ...(msg as any),
                complete: {
                  source: { id: node.id, type: NC.type, name: node.name },
                },
              });
            }

            done();
            this.log("Input processed");
          } catch (error) {
            const errorMsg =
              error instanceof Error
                ? error.message
                : "Unknown error during input handling";

            // Send to error port if enabled (explicit this.error() also sends, but
            // this catches uncaught exceptions that bypass this.error())
            const errorIdx = node._getErrorPortIndex();
            if (errorIdx !== null) {
              node._sendToPort(errorIdx, {
                ...(msg as any),
                error: {
                  message: errorMsg,
                  source: { id: node.id, type: NC.type, name: node.name },
                },
              });
            }

            if (error instanceof Error) {
              this.error("Error while processing input: " + error.message, msg);
              done(error);
            } else {
              this.error("Unknown error occurred during input handling", msg);
              done(new Error(errorMsg));
            }
          }
        },
      );

      this.on(
        "close",
        async (removed: boolean, done: (err?: Error) => void) => {
          try {
            this.log("Calling closed");
            await Promise.resolve(node._closed(removed));
            this.log("Node was closed");
            done();
          } catch (error) {
            if (error instanceof Error) {
              this.error("Error while closing node: " + error.message);
              done(error);
            } else {
              this.error("Unknown error occurred while closing node");
              done(new Error("Unknown error occurred while closing node"));
            }
          }
        },
      );
    },
    {
      credentials: NC.credentialsSchema
        ? getCredentialsFromSchema(NC.credentialsSchema)
        : {},
      settings: NC._settings?.(),
    },
  );

  await Promise.resolve(NC._registered?.(RED));

  RED.log.debug(`Type registered: ${NC.type}`);
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
  const fn = async function (RED: RED) {
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
  };
  (fn as RegistrationFunction).nodes = nodes;
  return fn as RegistrationFunction;
}

interface ModuleDefinition {
  nodes: NodeConstructor[];
}

function defineModule(definition: ModuleDefinition): ModuleDefinition {
  return definition;
}

export { registerType, registerTypes, defineModule };
export type { ModuleDefinition };
export {
  Node,
  IONode,
  ConfigNode,
  defineIONode,
  defineConfigNode,
} from "./nodes";
export { NrgError } from "../errors";
export type { RED } from "./types";
export { SchemaType, defineSchema } from "./schemas";
export type { Schema, Infer } from "./schemas/types";
/** @internal — used by @bonsae/nrg/test */
export { initValidator } from "./validation";
