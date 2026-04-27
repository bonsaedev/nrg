import path from "path";
import fs from "fs";
import { getCredentialsFromSchema } from "./utils";
import { Node } from "./nodes";
import { type RED } from "./types";
import { initValidator } from "./validator";
import { NrgError } from "../errors";

const MIME: Record<string, string> = {
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".map": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

let _nrgResourcesRegistered = false;

function serveNrgResources(RED: RED): void {
  if (_nrgResourcesRegistered) return;
  _nrgResourcesRegistered = true;

  const clientDir = path.resolve(__dirname, "./resources");
  if (!fs.existsSync(clientDir)) return;

  const httpAdmin = (RED as any).httpAdmin;
  if (!httpAdmin) return;

  // /nrg/assets/ is not handled by Node-RED's editorApp, so our handler
  // appended via use() is reached normally without any stack manipulation.
  httpAdmin.use(function (req: any, res: any, next: any) {
    const prefix = "/nrg/assets/";
    if (!(req.path as string).startsWith(prefix)) return next();
    let reqPath = (req.path as string).slice(prefix.length);
    // Serve the Vue dev build in development for devtools support
    if (
      reqPath === "vue.esm-browser.prod.js" &&
      process.env.NODE_ENV !== "production"
    ) {
      const devPath = path.resolve(clientDir, "vue.esm-browser.js");
      if (fs.existsSync(devPath)) {
        reqPath = "vue.esm-browser.js";
      }
    }
    const filePath = path.resolve(clientDir, reqPath);
    const rel = path.relative(clientDir, filePath);
    if (rel.startsWith("..") || path.isAbsolute(rel)) return next();
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile())
      return next();
    const ext = path.extname(filePath);
    res.setHeader("Content-Type", MIME[ext] ?? "application/octet-stream");
    fs.createReadStream(filePath).pipe(res);
  });
}

type AnyNodeClass = (abstract new (...args: any[]) => Node) &
  Partial<typeof Node>;

/**
 * Registers a custom node with Node-RED.
 *
 * @param RED - The Node-RED runtime API object
 * @param NodeClass - A node class extending Node, IONode, or ConfigNode
 * @throws If NodeClass does not extend Node
 * @throws If NodeClass.type is not defined
 */
async function registerType(RED: RED, NodeClass: AnyNodeClass) {
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

  if (
    NC.inputs !== undefined &&
    (!Number.isInteger(NC.inputs) || (NC.inputs !== 0 && NC.inputs !== 1))
  ) {
    throw new NrgError(
      `Invalid number of inputs for ${NodeClass.type}: inputs must be 0 or 1`,
    );
  }

  if (
    NC.outputs !== undefined &&
    (!Number.isInteger(NC.outputs) || NC.outputs < 0)
  ) {
    throw new NrgError(
      `Invalid number of outputs for ${NodeClass.type}: outputs must be a positive integer`,
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
            done();
            this.log("Input processed");
          } catch (error) {
            if (error instanceof Error) {
              this.error("Error while processing input: " + error.message, msg);
              done(error);
            } else {
              this.error("Unknown error occurred during input handling", msg);
              done(new Error("Unknown error during input handling"));
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

type NodeRedPackageFunction = ((RED: RED) => Promise<void>) & {
  nodes: AnyNodeClass[];
};

/**
 * Registers multiple node classes with Node-RED.
 *
 * Returns a Node-RED package function that Node-RED calls with the RED
 * runtime object when loading the package.
 *
 * @param nodes - Array of node classes to register
 */
function registerTypes(nodes: AnyNodeClass[]): NodeRedPackageFunction {
  const fn = async function (RED: RED) {
    initValidator(RED);
    serveNrgResources(RED);
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
  (fn as NodeRedPackageFunction).nodes = nodes;
  return fn as NodeRedPackageFunction;
}

export { registerType, registerTypes };
export { Node, IONode, ConfigNode } from "./nodes";
export { NrgError } from "../errors";
export type { RED } from "./types";
export { SchemaType, defineSchema } from "./schemas";
export type { Schema, Infer } from "./schemas/types";
