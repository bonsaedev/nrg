import type { NodeConstructor } from "./nodes";
import { NRG_NODE } from "./nodes/symbols";
import type { RED } from "./red";
import { initValidator } from "./validation";
import { initRoutes } from "./api";
import { NrgError } from "../shared/errors";
import { Kind } from "../shared/schemas";

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

  await NodeClass.register(RED);
  RED.log.debug(`Type registered: ${NodeClass.type}`);
}

/**
 * Every schema a node declares, flattened with a role label. `outputsSchema` may
 * be a single schema, a positional array, or a named record — each output port
 * carries its own schema, so all are collected individually.
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
  add("input", NodeClass.inputSchema);

  const outputs = NodeClass.outputsSchema;
  if (Array.isArray(outputs)) {
    outputs.forEach((schema, i) => add(`output[${i}]`, schema));
  } else if (outputs && typeof outputs === "object" && !(Kind in outputs)) {
    // Named-port record (`{ success, failure }`): the record itself carries no
    // TypeBox `Kind` — only its per-port schema values do.
    for (const [port, schema] of Object.entries(outputs)) {
      add(`output.${port}`, schema);
    }
  } else {
    add("output", outputs);
  }

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
