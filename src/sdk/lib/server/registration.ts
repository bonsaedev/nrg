import type { NodeConstructor } from "./nodes";
import {
  NRG_NODE,
  NRG_SETUP_CLOSE_HANDLER,
  NRG_SETUP_INPUT_HANDLER,
} from "./nodes/symbols";
import type { RED, NodeRedNode } from "./red";
import { initValidator } from "./validation";
import { initRoutes } from "./api";
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

/**
 * Every schema a node declares (config, credentials, settings), flattened with a
 * role label. Input/output data-validation schemas are config-driven (JSON-string
 * fields in config), not static class props, so they're not collected here.
 */
function collectNodeSchemas(
  NodeClass: NodeConstructor,
): { role: string; schema: Record<string, unknown> }[] {
  const found: { role: string; schema: Record<string, unknown> }[] = [];
  const add = (role: string, schema: unknown) => {
    if (schema && typeof schema === "object") {
      found.push({ role, schema: schema as Record<string, unknown> });
    }
  };

  add("config", NodeClass.configSchema);
  add("credentials", NodeClass.credentialsSchema);
  add("settings", NodeClass.settingsSchema);

  return found;
}

/**
 * Enforce the `$id` contract across a package's schemas before any node
 * registers. `$id` is the AJV compile-cache key (see {@link Validator}), so it
 * must be unique — {@link Validator.reserveSchemaId} throws on a collision. A
 * schema that carries properties but no `$id` is recompiled on every validation
 * and cannot be `$ref`'d; that is almost always a raw `SchemaType.Object` where
 * `defineSchema` was intended, so warn (empty pass-through schemas are fine, so
 * this never fails the build).
 */
function checkSchemaIds(RED: RED, nodes: NodeConstructor[]): void {
  for (const NodeClass of nodes) {
    for (const { role, schema } of collectNodeSchemas(NodeClass)) {
      const owner = `${NodeClass.type}.${role}`;
      const id = schema.$id;
      if (typeof id !== "string" || id.length === 0) {
        const props = schema.properties as Record<string, unknown> | undefined;
        if (props && Object.keys(props).length > 0) {
          RED.log.warn(
            `[nrg] ${owner} schema has properties but no $id — it recompiles on ` +
              `every validation and cannot be $ref'd. Build it with ` +
              `defineSchema(props, { $id: "${NodeClass.type}:${role}" }).`,
          );
        }
        continue;
      }
      RED.validator.reserveSchemaId(schema, owner);
    }
  }
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
        checkSchemaIds(RED, nodes);
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
