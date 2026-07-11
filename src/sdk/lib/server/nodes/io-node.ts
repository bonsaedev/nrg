import type { Schema } from "../../shared/schemas";
import type { RED, NodeRedNode } from "../red";
import { Node } from "./node";
import { NrgError } from "../../shared/errors";
import type {
  IIONode,
  IONodeContext,
  IONodeContextScope,
  IONodeStatus,
  IONodeConfig,
  IONodeCredentials,
} from "./types";
import { setupContext } from "./context";
import {
  NRG_SETUP_INPUT_HANDLER,
  NRG_PORTS,
  NRG_PROTECTED_LANE,
} from "../symbols";
import { laneProxy, packageLane } from "../lane-store";
import type {
  OutputPortNames,
  PortValue,
  InputMessage,
  NodeSource,
  MessageSource,
  ErrorInfo,
  StatusPortOutput,
} from "./types/ports";
import { AsyncLocalStorage } from "node:async_hooks";

/** Per-`input()`-invocation context — see `IONode.#invocation`. */
interface InputInvocation {
  inputMsg: unknown;
  send: (msg: any) => void;
  /**
   * Set by `this.error(message, msg)` once it has emitted to the error port, so
   * the input handler's catch does not ALSO auto-emit if the same invocation
   * then throws — one failure must produce exactly one error-port message.
   */
  errorEmitted?: boolean;
}

const RETURN_PROPERTY_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** Key holding the append-only lineage of prior input messages. Visible in
 * the debug panel by design — it is the node's provenance chain. */
const INPUT_KEY = "input";

/** Key holding the producing-node provenance on every data-port output. */
const SOURCE_KEY = "source";

/** Node-RED's message-lineage id. A node's output inherits its input's value —
 * Node-RED mints a fresh one ONLY when absent — so the framework must carry it
 * forward on every outgoing message rather than let it be regenerated per hop. */
const MSGID_KEY = "_msgid";

/**
 * Message keys the framework owns on an outgoing message: the provenance
 * metadata (`source`/`input`), the built-in port markers, and Node-RED's own
 * `_msgid`. A return property may not be any of these — it would overwrite a
 * framework key on the same message — so the config-time check rejects them.
 */
const RESERVED_RETURN_PROPERTIES = new Set<string>([
  SOURCE_KEY,
  INPUT_KEY,
  "error",
  "complete",
  "status",
  MSGID_KEY,
]);

/** The build-injected port topology (see `port-topology-injector`). Framework-
 * owned: the injector stamps it under `NRG_PORTS`, non-writable — never set from
 * node code. It is the ONLY source of a node's ports (TS types → topology). */
interface NodePortsDescriptor {
  inputs: 0 | 1;
  outputs: number;
  outputNames?: string[];
}

/**
 * How much of the incoming message's history an outgoing message keeps under
 * `input`. Every mode places the result at the return key (`output` by default)
 * and the previous message under `input`; they differ ONLY in the DEPTH of that
 * `input` chain — a single dial. The outgoing root is always just the result at
 * its return key: incoming keys are never flattened forward, they stay reachable
 * under `input`.
 * - `"reset"` (depth 0): only the result — no `input` frame. Use for source
 *   nodes that intentionally start a fresh message.
 * - `"carry"` (default, depth 1): the previous message under `input`, but with
 *   ITS own `input` stripped, so the provenance chain never grows past one level.
 *   `msg.input.<returnKey>` is the immediately-previous result; nothing older is
 *   kept, and a source's own fields survive exactly one hop, then drop. Loop-safe.
 * - `"trace"` (depth ∞): the previous message under `input`, untouched, so the
 *   chain accumulates one frame per node (`msg.input.input…`) — full lineage back
 *   to the source, a provenance trail visible in the debug panel.
 */
export type ContextMode = "carry" | "trace" | "reset";

/**
 * Base class for nodes that process messages. Provides input/output handling,
 * schema validation, status updates, and emit port management.
 *
 * Every node has a return key (`"output"` by default): the value passed to
 * `send()` is placed at that key and the incoming message is kept under `input`
 * (`{ [returnKey]: result, input: msg }`), so the prior message stays
 * recoverable. How deep that `input` history goes is the per-port context mode —
 * `carry` (default, last message only), `trace` (the full `input.input…` chain),
 * or `reset` (no history). The return key, output validation, and context mode
 * all resolve per output port; the framework exposes an editable return-property
 * and context-mode control on every node, and declaring `outputReturnProperties`
 * / `outputContextModes` in the `configSchema` only changes each port's default —
 * it does not change that a return key always exists. `this.send(x)` always means
 * "x is the result", never "x is the whole message".
 *
 * The `input()` parameter is {@link InputMessage}`<Input>` — the wire `Input`
 * plus the off-the-wire lanes (`msg.protected` / `msg.private`) and metadata
 * (`msg._msgid`). OMIT the annotation and TypeScript infers all of it from the
 * `Input` generic (which stays the plain wire shape — lanes are not ports).
 * Re-annotating the parameter with the raw wire type discards the lanes and meta.
 *
 * @example
 * ```ts
 * export default class MyNode extends IONode<Config, any, Input, Output> {
 *   static readonly type = "my-node";
 *   static readonly category = "function";
 *   static readonly color = "#ffffff" as const;
 *
 *   async input(msg) {               // no annotation — msg is InputMessage<Input>
 *     const conn = msg.private.conn; // off-wire, package-scoped
 *     const id = msg._msgid;         // Node-RED's message id, typed
 *     // sends { output: <result>, input: msg } (carry default: last msg kept),
 *     // and stashes trace/res on the protected/private lanes off the wire:
 *     this.send(msg.payload.toUpperCase(), { traceId }, { res });
 *   }
 * }
 * ```
 *
 * @see {@link InputMessage} — the wire type plus lanes and metadata.
 *
 * @typeParam TConfig - config shape (position 1)
 * @typeParam TCredentials - credentials shape (position 2)
 * @typeParam TInput - incoming message shape (position 3)
 * @typeParam TOutput - outgoing result / named-port map (position 4)
 * @typeParam TSettings - settings shape (position 5)
 *
 * NOTE: the positional generics all default to `any`, so a transposed order
 * (e.g. swapping `TInput`/`TOutput`) is silently accepted and mis-types
 * `input()`/`send()`. Settings sits at position **5** here but position **3** on
 * {@link Node}/{@link ConfigNode}.
 */
abstract class IONode<
  TConfig = any,
  TCredentials = any,
  TInput = any,
  TOutput = any,
  TSettings = any,
>
  extends Node<TConfig, TCredentials, TSettings>
  implements IIONode<TConfig, TCredentials, TInput, TOutput, TSettings>
{
  public static readonly align?: "left" | "right";
  /**
   * Node palette color. The template-literal type only enforces a leading `#`
   * (an exact 6-hex-digit template type is infeasible — it explodes to `TS2590`),
   * so shorthand (`#abc`) and invalid hex type-check but are rejected at runtime.
   * The real gate is the `/^#[0-9A-Fa-f]{6}$/` check in `Node.register`.
   */
  public static readonly color: `#${string}`;

  // Build-injected port topology; framework-owned, stamped under `NRG_PORTS` by
  // the port-topology injector (non-writable). `declare` — the value comes only
  // from the injector, so no field initializer is emitted to race it.
  declare public static [NRG_PORTS]?: NodePortsDescriptor;

  // Port topology is TS-types-only: the build extracts a node's `Input`/`Output`
  // generics and stamps them under `NRG_PORTS`. There is no schema fallback.
  public static get inputs(): 0 | 1 {
    return this[NRG_PORTS]?.inputs ?? 0;
  }

  public static get outputs(): number {
    return this[NRG_PORTS]?.outputs ?? 0;
  }

  /**
   * The names of the base output ports for a named-port node (`Port<T>` record
   * in the `Output` generic), in declaration order — otherwise `undefined` (a
   * single or positional output). Read straight off the injected topology.
   */
  public static get outputPortNames(): string[] | undefined {
    return this[NRG_PORTS]?.outputNames;
  }

  /**
   * Per-`input()`-invocation context, scoped via AsyncLocalStorage. One store
   * per class, shared by every instance: each `.run()` isolates one input()
   * call (and everything it `await`s, including detached `.then`/timer
   * continuations it schedules) into its own session, so concurrent inputs on a
   * node never clobber each other's context and a deferred send keeps the
   * context of the input that scheduled it. Real Node-RED never awaits an async
   * input handler before delivering the next message, so two inputs can be in
   * flight at once. `getStore()` is `undefined` only for a send made entirely
   * outside any `input()` (e.g. a timer set up in `created()`): it carries no
   * inherited context and delivers via `node.send`. Server-only — this is part
   * of the node runtime and is never imported in a browser.
   */
  static readonly #invocation = new AsyncLocalStorage<InputInvocation>();

  declare public readonly config: IONodeConfig<TConfig>;
  declare protected readonly context: IONodeContext;

  constructor(
    RED: RED,
    node: NodeRedNode,
    config: IONodeConfig<TConfig>,
    credentials: IONodeCredentials<TCredentials>,
  ) {
    super(RED, node, config, credentials);

    const context = node.context();
    const resolve = (scope: IONodeContextScope, store?: string) => {
      const target =
        scope === "global"
          ? context.global
          : scope === "flow"
            ? context.flow
            : context;
      return setupContext(target, store);
    };

    this.context = Object.assign(resolve, {
      node: setupContext(context),
      flow: setupContext(context.flow),
      global: setupContext(context.global),
    });

    // Validate any per-port return keys up front.
    const outputReturnProperties = this.config.outputReturnProperties;
    if (outputReturnProperties) {
      for (const [port, key] of Object.entries(outputReturnProperties)) {
        const trimmed = typeof key === "string" ? key.trim() : "";
        if (!trimmed) continue;
        if (!RETURN_PROPERTY_PATTERN.test(trimmed)) {
          throw new NrgError(
            `Invalid return property "${key}" for output port ${port} in ${(this.constructor as typeof IONode).type} — ` +
              `it must be a valid JavaScript identifier (letters, digits, _, $; not starting with a digit)`,
          );
        }
        if (RESERVED_RETURN_PROPERTIES.has(trimmed)) {
          throw new NrgError(
            `Reserved return property "${trimmed}" for output port ${port} in ${(this.constructor as typeof IONode).type} — ` +
              `the framework owns this key on the outgoing message (source/input provenance and the built-in ports). Choose another name.`,
          );
        }
      }
    }
  }

  // Wires the `input` handler (IONode only). The base Node wires `close`
  // separately (NRG_SETUP_CLOSE_HANDLER); the registrar invokes both.
  [NRG_SETUP_INPUT_HANDLER](createdPromise: Promise<void>) {
    this.node.on(
      "input",
      async (
        msg: unknown,
        send: (msg: unknown) => void,
        done: (err?: Error) => void,
      ) => {
        try {
          await createdPromise;
        } catch (initError) {
          // Surface the real cause from created() instead of a generic message.
          done(
            initError instanceof Error
              ? initError
              : new Error(String(initError)),
          );
          return;
        }

        // Own the invocation store here so the catch below can see whether
        // `this.error(msg)` already emitted to the error port (the ALS run()
        // scope has exited by the time the catch runs).
        const store: InputInvocation = { inputMsg: msg, send };

        try {
          this.node.log("Calling input");
          const result = await this.#input(msg as TInput, store);

          // Send to complete port if enabled. `source` (who completed it) and
          // `input` (what it was processing) ride the root, side by side — the
          // same shape as every other port. The `complete` key carries input()'s
          // return VALUE when there is one (e.g. an async node that awaits work
          // and yields it); a void return omits `complete` entirely — arrival on
          // the complete wire is itself the completion signal. Guard before
          // building: the payload (nodeSource alloc) is otherwise constructed on
          // every successful input even though the complete port is disabled by
          // default, then discarded inside #sendToPort.
          if (this.config.completePort) {
            this.#sendToPort("complete", {
              ...(result !== undefined ? { complete: result } : {}),
              [SOURCE_KEY]: this.#nodeSource(),
              [INPUT_KEY]: msg,
            });
          }

          done();
          this.node.log("Input processed");
        } catch (error) {
          const errorMsg =
            error instanceof Error
              ? error.message
              : "Unknown error during input handling";
          const err = error instanceof Error ? error : new Error(errorMsg);

          // A framework NrgError (API misuse — e.g. sendToPort to a built-in
          // port, an unknown named port) is a developer bug, not runtime data:
          // surface it loudly via done(err), never swallow it to the error port.
          if (!(error instanceof NrgError) && this.config.errorPort) {
            // The node handles the error itself via its error port, so it is the
            // SOLE handler: emit the clean error message (unless this.error()
            // already did for this invocation), log it once, and complete
            // WITHOUT reporting to Node-RED's Catch/done-error mechanism. Routing
            // there too would report the error twice (done(err) internally calls
            // node.error(err, msg)) AND stamp `msg.error` on the shared incoming
            // message — surfacing a second, differently-shaped error under our
            // `input` frame.
            if (!store.errorEmitted) {
              const errorData: Record<string, unknown> =
                error && typeof error === "object"
                  ? { ...(error as Record<string, unknown>) }
                  : {};
              // Drop undefined-valued own props (e.g. an unset optional field on
              // a custom Error subclass) — they carry no information, JSON already
              // omits them, and they only clutter the error object in the debug
              // panel.
              for (const k of Object.keys(errorData)) {
                if (errorData[k] === undefined) delete errorData[k];
              }
              // A thrown error's own enumerable properties are spread INTO the
              // `error` block first, so authors can throw a custom `Error`
              // subclass carrying extra data (e.g. `this.code = …`). `name`,
              // `message`, and `stack` are then layered on to preserve the full
              // Error structure — they are NON-enumerable on an Error, so the
              // spread above drops them; `name`/`message` stay authoritative and
              // `stack` (when present) carries the trace. `source` and the failing
              // message (`input`) ride the ROOT, side by side with `error` — the
              // same shape as every other port.
              const stack = error instanceof Error ? error.stack : undefined;
              this.#sendToPort("error", {
                error: {
                  ...errorData,
                  name: (error as { name?: string })?.name ?? "Error",
                  message: errorMsg,
                  ...(stack ? { stack } : {}),
                },
                [SOURCE_KEY]: this.#nodeSource(),
                [INPUT_KEY]: msg,
              });
              this.node.error(errorMsg); // log only — no msg, so no Catch routing
            }
            done();
          } else {
            // The node does NOT handle the error (no error port), or it is a
            // framework misuse — fall back to Node-RED's Catch mechanism.
            // `done(err)` reports to Catch and logs exactly once (internally it
            // calls node.error(err, msg)); calling node.error too would
            // double-report.
            done(err);
          }
        }
      },
    );
  }

  public input(msg: InputMessage<TInput>): unknown {
    return undefined;
  }

  async #input(msg: TInput, store: InputInvocation) {
    const shouldValidateInput = this.config.validateInput ?? false;
    // Resolve the effective schema only when validation is on, so an override is
    // never parsed/compiled (nor warned about) for a node that isn't validating.
    if (shouldValidateInput) {
      const inputSchema = this.#effectiveInputSchema();
      if (inputSchema) {
        this.node.log("Validating input");
        this.RED.validator.validate(msg, inputSchema, {
          // Pure predicate: never coerce or inject defaults into the live msg
          // that continues downstream.
          mutate: false,
          throwOnError: true,
        });
        this.node.log("Input is valid");
      }
    }
    // Expose the off-the-wire lanes on THIS node's incoming message, scoped to
    // its package for `private`. Set up per node (re-applied at each hop), so a
    // downstream node from another package reads its own `private` partition. The
    // assertion narrows `msg` to carry the lanes for the `this.input(msg)` call.
    this.#setupLanes(msg);
    // Scope this invocation's input msg + send so a concurrent input() call
    // can't clobber the context this one carries. All per-invocation state
    // lives in the store — there is no shared instance field to race on.
    return await IONode.#invocation.run(store, () =>
      Promise.resolve(this.input(msg)),
    );
  }

  /**
   * Add non-enumerable `protected`/`private` accessors to the incoming message.
   * Non-enumerable so they never serialize, clone, or show in the debug panel;
   * each reads the lane store by the message's `_msgid`, `private` partitioned by
   * this node's package. A core function node gets the bare message and has no
   * accessor — the lanes are structurally invisible to the flow author.
   *
   * An assertion signature: on return, `msg` is known to be an
   * {@link InputMessage} (wire + lanes + `_msgid`) so the caller can hand it to
   * `input()`. A non-object message (never produced by real Node-RED, which
   * always delivers an object) is left untouched.
   */
  #setupLanes(msg: TInput): asserts msg is InputMessage<TInput> {
    if (msg == null || typeof msg !== "object") return;
    const store = this.RED.laneStore;
    const pkg = packageLane(this.constructor);
    Object.defineProperty(msg, "protected", {
      configurable: true,
      enumerable: false,
      get() {
        return laneProxy(
          store,
          (this as { _msgid: string })._msgid,
          NRG_PROTECTED_LANE,
        );
      },
    });
    Object.defineProperty(msg, "private", {
      configurable: true,
      enumerable: false,
      get() {
        return laneProxy(store, (this as { _msgid: string })._msgid, pkg);
      },
    });
  }

  public send(msg: TOutput, protectedData?: object, privateData?: object) {
    // Every emission is delivered as a Node-RED positional array — one slot per
    // base output port — so the captured shape is uniform regardless of arity.
    // Since `node.send([m]) === node.send(m)` for port 0, flow behaviour is
    // unchanged; only the recorded/asserted shape becomes consistent.
    //
    // A multi-output node uses Node-RED's array-as-ports convention (one value
    // per port). A single-output node always treats the argument as the value
    // (arrays included) — hence the `baseOutputs > 1` guard, which keeps a
    // single-output `send([a, b])` meaning "the value at port 0 is [a, b]".
    const multi = this.#baseOutputs > 1 && Array.isArray(msg);
    const values = multi
      ? (msg as unknown[]).slice(0, this.#baseOutputs)
      : [msg];

    const out = values.map((m, port) => {
      if (m == null) return m; // preserve sparse/null slots
      this.#validatePort(m, port);
      return this.#wrapOutgoing(m, this.#resolveContextMode(port), port);
    });

    this.#writeLanes(protectedData, privateData, out);
    this.#deliver(out);
  }

  /**
   * Merge the `protected`/`private` args into this message's lanes. Keyed by the
   * outgoing `_msgid`: an input-triggered send inherits it; a source send (no
   * invocation) mints one and stamps it on the outgoing frames so a downstream
   * node reads the same lane. Contributions are STICKY — they persist for the
   * message's journey, so a middle node's plain `send()` keeps them alive.
   */
  #writeLanes(
    protectedData: object | undefined,
    privateData: object | undefined,
    out: unknown[],
  ): void {
    if (!protectedData && !privateData) return;
    const existing = (
      IONode.#invocation.getStore()?.inputMsg as
        | Record<string, unknown>
        | undefined
    )?.[MSGID_KEY] as string | undefined;
    // A source send (no incoming message) mints an id in Node-RED's own
    // lineage-id format via `generateId()`, so the value we stamp as `_msgid`
    // reads the same as one Node-RED assigns (message-flow debugger, Catch/
    // Complete grouping, and `_msgid` correlation all key off that format).
    const msgid = existing ?? this.RED.util.generateId();
    if (!existing) {
      for (const m of out) {
        if (m && typeof m === "object") {
          const rec = m as Record<string, unknown>;
          if (rec[MSGID_KEY] === undefined) rec[MSGID_KEY] = msgid;
        }
      }
    }
    const store = this.RED.laneStore;
    if (protectedData) store.merge(msgid, NRG_PROTECTED_LANE, protectedData);
    if (privateData) {
      store.merge(msgid, packageLane(this.constructor), privateData);
    }
  }

  #deliver(out: unknown) {
    // Deliver via this invocation's send callback (concurrency-safe). A send
    // made outside any input() call (e.g. a timer) has no store and falls back
    // to node.send.
    const send = IONode.#invocation.getStore()?.send;
    if (send) {
      send(out);
    } else {
      this.node.send(out);
    }
  }

  /**
   * Per-port output validation. A port validates when its flow-author flag
   * (`config.validateOutputs[port]`, whose default the node author seeds in the
   * config schema) is on and a schema exists for that port.
   */
  #validatePort(value: unknown, port: number) {
    if (!this.config.validateOutputs?.[port]) return;

    const schema = this.#effectiveOutputSchema(port);
    if (!schema) return;
    this.node.log("Validating output");
    this.RED.validator.validate(value, schema, {
      // Pure predicate: don't coerce or default the outgoing value.
      mutate: false,
      throwOnError: true,
    });
    this.node.log("Output is valid");
  }

  // Per-instance cache of resolved data-validation schemas, keyed by the raw JSON
  // string (a node's config is immutable for its lifetime). `null` = the string
  // is unusable (bad JSON, or valid JSON that does not compile) → the boundary is
  // not validated. Memoizing keeps the SAME parsed object across messages, so
  // the validator's object-keyed compile cache hits: no per-message JSON.parse,
  // no per-message recompile/leak, and the warning fires exactly once.
  readonly #overrideSchemas = new Map<string, Schema | null>();

  /** Resolve a data-validation schema (a JSON-Schema string from config — the
   * author default, overridable by the flow author in the editor) to a schema
   * object, memoized per instance. `undefined` → no schema (blank / not a
   * string), so the boundary is not validated. A string that is invalid JSON, or
   * valid JSON that does NOT compile (a typo'd keyword), also yields `undefined`
   * — warned once here rather than throwing on every message inside `validate()`. */
  #resolveOverride(raw: unknown): Schema | undefined {
    if (typeof raw !== "string" || !raw.trim()) return undefined;
    const cached = this.#overrideSchemas.get(raw);
    if (cached !== undefined) return cached ?? undefined;
    let resolved: Schema | null = null;
    try {
      const parsed = JSON.parse(raw) as Schema;
      // Compile once now so a structurally-invalid schema fails closed here
      // (warn + skip validation) instead of throwing on every message.
      this.RED.validator.createValidator(parsed, false);
      resolved = parsed;
    } catch (e) {
      const reason = e instanceof Error ? e.message : "parse/compile error";
      this.node.warn(
        `Ignoring an invalid data-validation schema (${reason}); skipping validation.`,
      );
    }
    this.#overrideSchemas.set(raw, resolved);
    return resolved ?? undefined;
  }

  /** The schema used for INPUT validation: the `config.inputSchema` field (the
   * node author's default, overridable by the flow author). Data-validation
   * schemas are config-driven only — there is no static schema. */
  #effectiveInputSchema(): Schema | undefined {
    return this.#resolveOverride(this.config.inputSchema);
  }

  /** The schema used for OUTPUT validation on a port: the `config.outputSchemas`
   * field for that port (author default, flow-author-overridable). */
  #effectiveOutputSchema(port: number): Schema | undefined {
    return this.#resolveOverride(this.config.outputSchemas?.[port]);
  }

  /**
   * The return key for an output port — `"output"` unless a custom one is set
   * via `outputReturnProperties[port]` (the node author's declared default and/or
   * the flow author's per-port override, which the editor always allows).
   * `this.send(x)` always means "x is the value at this port's return key",
   * never "x is the whole outgoing message".
   */
  #returnPropertyKey(port: number): string {
    const configured = this.config.outputReturnProperties?.[port];
    if (typeof configured === "string" && configured.trim()) {
      return configured.trim();
    }
    return "output";
  }

  /**
   * Resolves the context mode for a base-output port from the flow author's
   * per-port config (`config.outputContextModes[port]`, which the editor lets the
   * flow author set on any port), falling back to `"carry"`.
   */
  #resolveContextMode(port: number): ContextMode {
    return this.config.outputContextModes?.[port] ?? "carry";
  }

  /**
   * Merges a sent value into the incoming message at the returnProperty key so
   * upstream message properties propagate. A fresh base is built per call so
   * multi-port sends never share an object.
   */
  #wrapOutgoing(value: unknown, mode: ContextMode, port: number): unknown {
    const key = this.#returnPropertyKey(port);
    // THIS invocation's input msg (per-call, concurrency-safe). A send made
    // entirely outside an input() call (e.g. a timer set up in created()) has no
    // scheduling input, so `input` is `{}` — no inherited context to record.
    const input =
      (IONode.#invocation.getStore()?.inputMsg as Record<string, unknown>) ??
      {};
    // `source` (producing node + port) rides every output as message metadata,
    // so walking the `input` chain shows which node and port produced each frame.
    const source = this.#outputSource(port);
    // Every mode puts the result at the return key and the incoming message under
    // `input`; they differ ONLY in the DEPTH of that `input` chain (see
    // ContextMode). A send with no incoming message (a source node, or a send
    // made outside any input() call) records no `input` frame — there is no prior
    // message. Node-RED clones messages 2..N on fan-out, so the shared `input`
    // reference is isolated per branch at delivery.
    //   reset (depth 0): no `input` frame.
    //   trace (depth ∞): the incoming message untouched, so the chain grows one
    //     frame per node (`input.input…`) — full lineage.
    // Every returned frame is stamped with the incoming `_msgid` (see #withMsgid)
    // so the message-lineage id is preserved in ALL context modes — including
    // `reset`, which keeps no `input` frame but must still not fork the id.
    const frame = (msg: Record<string, unknown>): unknown =>
      this.#withMsgid(
        Object.keys(msg).length
          ? { [key]: value, [SOURCE_KEY]: source, [INPUT_KEY]: msg }
          : { [key]: value, [SOURCE_KEY]: source },
      );
    if (mode === "reset")
      return this.#withMsgid({ [key]: value, [SOURCE_KEY]: source });
    // trace keeps the full lineage, but forwards a SHALLOW COPY of the incoming
    // message — `{ ...input }` drops the non-enumerable `protected`/`private`
    // accessors this node's `#setupLanes` stamped (they're scoped to THIS node's
    // package), so a different-package downstream node reading `msg.input.private`
    // can't reach into this package's private partition. Each hop copies before
    // forwarding, so the whole `input.input…` chain stays lane-free. `carry` is
    // already safe for the same reason (it spreads `input` below).
    if (mode === "trace") return frame({ ...input });
    // carry (depth 1): keep the previous message but strip ITS own `input` frame,
    // so the chain never grows past one level (loop-safe). A source's own fields
    // survive exactly one hop, then drop.
    const lastOnly = { ...input };
    delete lastOnly[INPUT_KEY];
    return frame(lastOnly);
  }

  /**
   * Preserve Node-RED's message-lineage id: a node's output inherits the
   * `_msgid` of the message it is processing (Node-RED assigns a fresh one only
   * when absent — see `Node.prototype.send`). Copying it onto every outgoing
   * message — in every context mode and on every port — stops the id forking at
   * each hop, which would otherwise break the message-flow debugger, Catch/
   * Complete grouping, and any `_msgid`-based correlation. Reads the current
   * invocation's input; a send outside any input() call (e.g. a source node)
   * has none, so nothing is stamped and Node-RED assigns one as usual.
   */
  #withMsgid(frame: Record<string, unknown>): Record<string, unknown> {
    const msgid = (
      IONode.#invocation.getStore()?.inputMsg as
        | Record<string, unknown>
        | undefined
    )?.[MSGID_KEY];
    return msgid !== undefined ? { ...frame, [MSGID_KEY]: msgid } : frame;
  }

  /**
   * Provenance stamped on every data-port output under `msg.source`: the
   * producing node plus the port the message was sent on (with the named-port
   * name when the node declares a `Port<T>` record). Message metadata, like
   * `_msgid` — never part of the typed result.
   */
  #outputSource(port: number): MessageSource {
    const portName = this.#namedPortKeys()?.[port];
    return {
      ...this.#nodeSource(),
      port,
      ...(portName ? { portName } : {}),
    };
  }

  // --- Built-in port management ---

  // Private, override-proof accessors the framework reads for port routing. A
  // consumer field named `baseOutputs`/`totalOutputs` shadows the PUBLIC getters
  // below (self-inflicted), but never these `#` ones the framework relies on.
  get #baseOutputs(): number {
    return (this.constructor as typeof IONode).outputs ?? 0;
  }

  get #totalOutputs(): number {
    let count = this.#baseOutputs;
    if (this.config.errorPort) count++;
    if (this.config.completePort) count++;
    if (this.config.statusPort) count++;
    return count;
  }

  public get baseOutputs(): number {
    return this.#baseOutputs;
  }

  public get totalOutputs(): number {
    return this.#totalOutputs;
  }

  /**
   * Send a message to a specific output port by index or name.
   * Named ports are resolved from the node's named `Port<T>` Output generic.
   * Numeric indices refer to the base output ports (0-based).
   *
   * Built-in ports (`"error"`, `"complete"`, `"status"`) are managed by the
   * framework and cannot be sent to directly. Use `this.status()` for status,
   * throw an error or call `this.error()` for the error port, and the complete
   * port is sent automatically on successful input processing.
   */
  public sendToPort<P extends OutputPortNames<TOutput> | number>(
    port: P,
    msg: P extends keyof TOutput ? PortValue<TOutput[P]> : unknown,
    protectedData?: object,
    privateData?: object,
  ) {
    if (port === "error" || port === "complete" || port === "status") {
      throw new NrgError(
        `sendToPort("${port}") is not allowed. Built-in ports are managed by the framework.`,
      );
    }
    const portIndex =
      typeof port === "number" ? port : this.#getNamedPortIndex(port);
    // Loud failure for an unknown named port: an unresolved name would otherwise
    // be silently dropped by #sendToPort. This is the only guard a JS author gets
    // (the OutputPortNames type is compile-time only).
    if (typeof port === "string" && portIndex === null) {
      const keys = this.#namedPortKeys();
      throw new NrgError(
        keys && keys.length
          ? `sendToPort("${port}") — unknown output port. Valid named ports: ${keys
              .map((n) => `"${n}"`)
              .join(", ")}.`
          : `sendToPort("${port}") — this node has no named output ports. Declare named ports with a Port<T> record in the node's Output generic, or send to a numeric port index.`,
      );
    }
    const idx = portIndex ?? 0;
    if (msg == null) {
      this.#sendToPort(port, msg, protectedData, privateData);
      return;
    }
    // Validate the outgoing value exactly as `send()` validates a positional
    // port: `sendToPort` is the PRIMARY emission path for named `Port` outputs,
    // so opt-in per-port output validation must apply here too (built-in ports
    // already returned above). A failure throws and routes to the error port.
    this.#validatePort(msg, idx);
    this.#sendToPort(
      port,
      this.#wrapOutgoing(msg, this.#resolveContextMode(idx), idx),
      protectedData,
      privateData,
    );
  }

  #sendToPort(
    port: number | string,
    msg: unknown,
    protectedData?: object,
    privateData?: object,
  ) {
    let portIndex: number | null;
    if (typeof port === "number") {
      portIndex = port;
    } else if (port === "error" || port === "complete" || port === "status") {
      portIndex = this.#getBuiltinPortIndex(port);
      if (portIndex === null) return;
    } else {
      portIndex = this.#getNamedPortIndex(port);
      // Defensive: the public sendToPort already threw on an unknown named port,
      // so this is unreachable from there — but never silently drop.
      if (portIndex === null) {
        throw new NrgError(`Unknown output port "${port}".`);
      }
    }
    const out = new Array(this.#totalOutputs);
    out[portIndex] =
      msg !== null && typeof msg === "object"
        ? this.#withMsgid(msg as Record<string, unknown>)
        : msg;
    // Off-the-wire lane contributions (sendToPort's protected/private args),
    // keyed by this message's _msgid exactly like `send()`. Internal built-in
    // port emissions (status/error/complete) pass none, so this is a no-op there.
    if (protectedData || privateData) {
      this.#writeLanes(protectedData, privateData, out);
    }
    this.node.send(out);
  }

  /** The declared named output ports (from the injected `Output`-generic
   * topology's `Port<T>` record), or null when the node has none (a
   * positional/single output, or no declaration). */
  #namedPortKeys(): string[] | null {
    const NC = this.constructor as typeof IONode;
    return NC[NRG_PORTS]?.outputNames ?? null;
  }

  #getNamedPortIndex(name: string): number | null {
    const keys = this.#namedPortKeys();
    if (!keys) return null;
    const idx = keys.indexOf(name);
    return idx === -1 ? null : idx;
  }

  #getBuiltinPortIndex(name: "error" | "complete" | "status"): number | null {
    if (name === "error") {
      return this.config.errorPort ? this.#baseOutputs : null;
    }
    let idx = this.#baseOutputs;
    if (this.config.errorPort) idx++;
    if (name === "complete") {
      return this.config.completePort ? idx : null;
    }
    if (this.config.completePort) idx++;
    return this.config.statusPort ? idx : null;
  }

  #nodeSource(): NodeSource {
    return {
      id: this.node.id,
      type: (this.constructor as typeof IONode).type,
      name: this.node.name,
    };
  }

  public status(status: IONodeStatus) {
    this.node.status(status);
    // `_msgid` is stamped onto the outgoing message by #withMsgid (or Node-RED
    // when there is no invocation), so it is intentionally absent here.
    this.#sendToPort("status", {
      status,
      source: this.#nodeSource(),
    } satisfies Omit<StatusPortOutput, "_msgid">);
  }

  public override error(message: string, msg?: any) {
    if (msg && this.config.errorPort) {
      // The node handles the error via its error port, so it is the sole
      // handler: emit to the port and log the message, but do NOT pass `msg` to
      // Node-RED's error mechanism — that would route the same error to Catch
      // nodes too and stamp `msg.error` on the shared message. Same shape as the
      // auto-emit path: the `error` block at the root (a downstream node reads
      // `msg.error`), with `source` and the passed message (`input`) beside it.
      this.#sendToPort("error", {
        error: {
          // `name` keeps the error-port payload consistent with the auto-emit
          // from a thrown error.
          name: "Error",
          message,
        } satisfies ErrorInfo,
        [SOURCE_KEY]: this.#nodeSource(),
        [INPUT_KEY]: msg,
      });
      super.error(message); // log only — no msg, so no Catch routing/mutation
      // Dedupe: if this call also throws, the input handler's catch must not
      // emit a second error-port message for the same failure.
      const store = IONode.#invocation.getStore();
      if (store) store.errorEmitted = true;
    } else {
      // No error port (or no msg) — standard Node-RED behavior: routes to Catch
      // when a msg is given, otherwise just logs.
      super.error(message, msg);
    }
  }

  public updateWires(wires: string[][]) {
    this.node.updateWires(wires);
  }

  public receive(msg: TInput) {
    this.node.receive(msg);
  }

  public get x(): number {
    return this.node.x;
  }

  public get y(): number {
    return this.node.y;
  }

  public get g(): string | undefined {
    return this.node.g;
  }

  public get wires(): string[][] {
    return this.node.wires;
  }

  public override get credentials():
    | IONodeCredentials<TCredentials>
    | undefined {
    return this.node.credentials;
  }
}

export { IONode };
