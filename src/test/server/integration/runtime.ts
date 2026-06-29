import http from "http";
import os from "os";
import fs from "fs";
import path from "path";
import { createRequire } from "module";
// Registration must bind to the SAME nrg copy the consumer's nodes extend, so
// the `instanceof Node` identity check inside registerType passes. Import the
// package's public server entry (resolved to the host project's installed nrg);
// a relative import would make esbuild bundle a second, non-identical copy.
import { registerTypes } from "@bonsae/nrg/server";
import type { NodeConstructor } from "../../../core/server/nodes/types/node";
import type { NodeRedContextStore } from "../../../core/server/nodered";
import { Recorder } from "./recorder";
import { Flow } from "./flow";

interface StartRuntimeOptions {
  /** Node classes (IONode / ConfigNode subclasses) to register in the runtime. */
  nodes: NodeConstructor[];
  /** Extra Node-RED settings merged over the headless defaults. */
  settings?: Record<string, unknown>;
}

/**
 * Resolve the consumer's `node-red` package and load its programmatic API.
 * The library never bundles Node-RED — it embeds whatever the project installed,
 * the same model as the dev server.
 */
function requireNodeRed(): NodeRedApi {
  const req = createRequire(path.join(process.cwd(), "package.json"));
  let entry: string;
  try {
    entry = req.resolve("node-red");
  } catch {
    throw new Error(
      "Integration tests need Node-RED installed. Add `node-red` as a devDependency.",
    );
  }
  return req(entry) as NodeRedApi;
}

function headlessSettings(
  userDir: string,
  overrides?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    // keep RED.httpAdmin a valid router (so node registration's route setup is
    // safe) but never serve the editor UI
    disableEditor: true,
    httpNodeRoot: false,
    userDir,
    flowFile: path.join(userDir, "flows.json"),
    credentialSecret: "nrg-integration-test",
    logging: { console: { level: "fatal", metrics: false, audit: false } },
    functionGlobalContext: {},
    ...overrides,
  };
}

/**
 * Boot a real, in-process Node-RED runtime with the given node types
 * registered. One runtime per test file (the runtime is a process-wide
 * singleton); each test deploys a flow into it and `flow.clear()`s between.
 */
async function startRuntime(options: StartRuntimeOptions): Promise<Runtime> {
  const RED = requireNodeRed();
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), "nrg-integration-"));
  const server = http.createServer();
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve()),
  );

  RED.init(server, headlessSettings(userDir, options.settings));

  const recorder = new Recorder();
  RED.hooks.add("onReceive", (event) =>
    recorder.recordReceived(event.destination?.id, event.msg),
  );

  // register node types through the same path production uses. The cast tracks
  // whatever `registerTypes` resolves to: `@bonsae/nrg/server` can land on the
  // source barrel or the built dist depending on tsc's resolution order, and the
  // two carry distinct (but structurally equivalent) NodeConstructor identities.
  // Casting to the resolved parameter type keeps this assignment valid either way.
  await registerTypes(options.nodes as Parameters<typeof registerTypes>[0])(
    RED as never,
  );
  await RED.start();

  // Prime the deploy pipeline with a throwaway empty deploy. Node-RED's very
  // first setFlows after start does not apply inline credentials to the
  // freshly-created nodes (it handles the initial deploy differently from every
  // subsequent one), so a node deployed with credentials on the first real
  // flow.deploy() would see them empty. Absorbing that first deploy here makes
  // the consumer's first flow.deploy() behave like all the others.
  await new Flow(RED, recorder).deploy();

  return new Runtime(RED, server, userDir, recorder);
}

class Runtime {
  readonly #RED: NodeRedApi;
  readonly #server: http.Server;
  readonly #userDir: string;
  readonly #recorder: Recorder;

  constructor(
    RED: NodeRedApi,
    server: http.Server,
    userDir: string,
    recorder: Recorder,
  ) {
    this.#RED = RED;
    this.#server = server;
    this.#userDir = userDir;
    this.#recorder = recorder;
  }

  /** Start a fresh flow to build, deploy, drive and inspect. */
  flow(): Flow {
    return new Flow(this.#RED, this.#recorder);
  }

  /** Stop Node-RED, close the server and remove the temp user dir. */
  async stop(): Promise<void> {
    try {
      await this.#RED.stop();
    } catch {
      /* best-effort */
    }
    await new Promise<void>((resolve) => this.#server.close(() => resolve()));
    try {
      fs.rmSync(this.#userDir, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  }
}

/** The slice of Node-RED's embedding API the harness uses. */
interface NodeRedApi {
  init(server: http.Server, settings: Record<string, unknown>): void;
  start(): Promise<void>;
  stop(): Promise<void>;
  hooks: {
    add(
      name: "onReceive",
      fn: (event: { destination?: { id?: string }; msg: unknown }) => void,
    ): void;
  };
  nodes: { getNode(id: string): RuntimeNode | null };
  events: {
    on(event: string, fn: (...args: unknown[]) => void): void;
    removeListener(event: string, fn: (...args: unknown[]) => void): void;
  };
  runtime: {
    flows: {
      setFlows(opts: {
        flows: { flows: unknown[] };
        deploymentType?: string;
      }): Promise<{ rev: string }>;
    };
  };
}

interface RuntimeNodeContext extends NodeRedContextStore {
  flow: NodeRedContextStore;
  global: NodeRedContextStore;
}

interface RuntimeNode {
  id: string;
  type: string;
  receive(msg: unknown): void;
  send(msg: unknown): void;
  context(): RuntimeNodeContext;
}

export { startRuntime, Runtime, requireNodeRed };
export type { StartRuntimeOptions, NodeRedApi, RuntimeNode };
