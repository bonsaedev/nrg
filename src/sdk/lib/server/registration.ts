import type { NodeConstructor } from "./nodes";
import {
  NRG_NODE,
  NRG_SETUP_CLOSE_HANDLER,
  NRG_SETUP_INPUT_HANDLER,
} from "./symbols";
import type { RED, NodeRedNode } from "./red";
import { init } from "./init";
import { NrgError } from "../shared/errors";
import {
  getCredentialsFromSchema,
  getSettingsFromSchema,
} from "../shared/schemas/utils";

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

  // Symbol brand check (not `instanceof Node`): robust across the toolkit/runtime
  // bundle split, where a duplicate `Node` class identity would break instanceof.
  if (!(NodeClass as unknown as Record<symbol, unknown>)[NRG_NODE]) {
    throw new NrgError(
      `${NodeClass.name} must extend IONode or ConfigNode classes`,
    );
  }

  if (!NodeClass.type) {
    throw new NrgError("type must be provided when registering the node");
  }

  if (NodeClass.color && !/^#[0-9A-Fa-f]{6}$/.test(NodeClass.color)) {
    throw new NrgError(
      `Invalid color "${NodeClass.color}" for ${NodeClass.type}: must be a 6-digit hex color like "#a6bbcf" (shorthand "#abc" is not accepted).`,
    );
  }

  RED.nodes.registerType(
    NodeClass.type,
    function (this: NodeRedNode, config: Record<string, unknown>) {
      RED.nodes.createNode(this, config);
      const node = new NodeClass(RED, this, config, this.credentials);
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
        (error: unknown) => {
          const message =
            error instanceof Error ? error.message : String(error);
          this.error("Error during created hook: " + message);
          throw error;
        },
      );
      // Surface a failed created() as an error status, not just a log. A node
      // with inputs also reports the failure per-input via done(), but an
      // input-less node has no handler awaiting createdPromise, so without
      // this its created() rejection would be logged once and otherwise
      // silently swallowed while the node stays registered.
      createdPromise.catch(() => {
        this.status({ fill: "red", shape: "ring", text: "created() failed" });
      });

      node[NRG_SETUP_CLOSE_HANDLER]();
      // Only IONode wires an input handler; a plain Node/ConfigNode has none.
      if (
        NRG_SETUP_INPUT_HANDLER in node &&
        typeof node[NRG_SETUP_INPUT_HANDLER] === "function"
      ) {
        node[NRG_SETUP_INPUT_HANDLER](createdPromise);
      }
    },
    {
      credentials: NodeClass.credentialsSchema
        ? getCredentialsFromSchema(NodeClass.credentialsSchema)
        : undefined,
      settings: NodeClass.settingsSchema
        ? getSettingsFromSchema(NodeClass.settingsSchema, NodeClass.type)
        : undefined,
    },
  );

  NodeClass.validateSettings(RED);
  // Isolation contract: a failing `registered()` hook is logged at error level
  // and swallowed, NOT rethrown. Registration runs one shared loop over every
  // node class in the package (see registerTypes), so rethrowing here would
  // abort registration of all *other* node types in the same package. The hook
  // is for optional one-time setup; a node whose hook fails still registers.
  try {
    await Promise.resolve(NodeClass.registered?.(RED));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    RED.log.error(
      `Error during registered hook for ${NodeClass.type}: ${message}`,
    );
  }

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
      init(RED); // globals (validator + lane store) + HTTP asset routes
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
