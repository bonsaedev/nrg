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
  NRG_PROTECTED_CHANNEL,
} from "../symbols";
import { channelProxy, packageChannel } from "../channels-store";
import { Channels, Meta } from "./types/ports";
import type {
  OutputPortNames,
  PortValue,
  WriteChannels,
  Port,
  OutputSpec,
  InputSpec,
  OmitMessageChannels,
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

/** The clone-safe root carrier for the framework metadata (`{ source }`).
 * Underscore-prefixed like `_msgid`: framework-owned, kept off every typed
 * surface, and an ENUMERABLE root key because Node-RED's fan-out clone
 * (messages 2..N) drops symbol properties — the `msg[Meta]` accessor installed
 * at delivery reads it back. Authors never touch it. */
const META_KEY = "_meta";

/** Node-RED's message-lineage id. A node's output inherits its input's value —
 * Node-RED mints a fresh one ONLY when absent — so the framework must carry it
 * forward on every outgoing message rather than let it be regenerated per hop. */
const MSGID_KEY = "_msgid";

/** Read-only correlation id a SOURCE/trigger node (no input port) stamps on the
 * `protected` channel when it emits: the id of the message it originated. Every
 * downstream node reads it via `msg[Channels].protected.transactionId` to correlate
 * all work back to that trigger firing. Frozen in the channel store, so no node can
 * overwrite or delete it. */
const TRANSACTION_ID_KEY = "transactionId";

/** The build-injected port topology (see `port-topology-injector`). Framework-
 * owned: the injector stamps it under `NRG_PORTS`, non-writable — never set from
 * node code. It is the ONLY source of a node's ports (TS types → topology). */
interface NodePortsDescriptor {
  inputs: 0 | 1;
  outputs: number;
  outputNames?: string[];
}

/**
 * How an output port builds its outgoing message RECORD from this send's named
 * additions:
 * - `"merge"` (default): `{ ...incoming, ...additions }` — the message is the
 *   flow's shared, accumulating record; this node contributes its fields and
 *   everything upstream flows on untouched. A re-entered node overwrites its OWN
 *   fields, so the record is bounded by the distinct nodes on a path, never by
 *   loop iterations.
 * - `"reset"`: `{ ...additions }` — a fresh record. For emissions that begin a
 *   new logical signal (a source firing, a per-item dispatch, a loop lap that
 *   should start clean).
 * A legacy `"passthrough"` value saved in an old flow resolves to `"merge"`.
 */
export type ContextMode = "merge" | "reset";

/**
 * Base class for nodes that process messages. Provides input/output handling,
 * schema validation, status updates, and emit port management.
 *
 * THE MESSAGE IS THE FLOW'S SHARED, ACCUMULATING RECORD. `send(port, additions)`
 * takes an OBJECT of named fields and MERGES it onto the incoming record
 * (`{ ...incoming, ...additions }`), so a field produced by an early node is
 * readable by a late node — nothing is silently lost across hops. A port's
 * {@link ContextMode} (`merge` default / `reset` = fresh record) resolves per
 * output port from the flow author's `outputContextModes[port]`, falling back
 * to the node author's declared default. Framework metadata never pollutes the
 * data surface: provenance rides `msg[Meta].source` (symbol accessor over the
 * `_meta` root carrier) and the off-the-wire channels ride `msg[Channels]`.
 * Built-in lifecycle ports follow the SAME merge rule — an error frame is the
 * processed record plus `error`, a complete frame is the record plus `input()`'s
 * returned fields — so lifecycle wires keep the full context too.
 *
 * The `input()` parameter is the node's `TInput` — an {@link Input}`<Port<…>>`: the
 * wire type plus the off-the-wire channels (`msg[Channels]`). ALWAYS annotate the
 * parameter with this alias — TypeScript does not infer an overridden method's
 * parameter from the base, so an un-annotated `input(msg)` is `any`. Annotating with the
 * bare wire type instead discards the channels. `_msgid` is deliberately not
 * on the parameter — it's the framework's internal channel key, not an author-facing
 * field.
 *
 * @example
 * ```ts
 * type MyNodeInput = Input<Port<{ payload: string }>>;
 * type MyNodeOutputs = Outputs<{ out: Port<{ result: string }> }>;
 * export default class MyNode extends IONode<Config, any, MyNodeInput, MyNodeOutputs> {
 *   static readonly type = "my-node";
 *   static readonly category = "function";
 *   static readonly color = "#ffffff" as const;
 *
 *   async input(msg: MyNodeInput) {          // always annotate with your Input alias
 *     const conn = msg[Channels].private.conn; // off-wire, package-scoped
 *     // merges { result } onto the incoming record (merge default — upstream
 *     // fields flow through), and stashes data on the channels off the wire:
 *     this.send("out", { result: msg.payload.toUpperCase() }, { protected: { traceId }, private: { res } });
 *   }
 * }
 * ```
 *
 * @see {@link Input} — the wire port plus the off-the-wire channels.
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
  TInput extends InputSpec = any,
  TOutput extends OutputSpec = any,
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

          // Send to complete port if enabled. Same MERGE rule as every data
          // port: the frame is the processed record plus `input()`'s returned
          // FIELDS (`{ ...record, ...result }`) — the return value IS the
          // complete-port record contribution, so it must be a plain object (or
          // void: arrival on the complete wire is itself the completion signal).
          // A non-object return is an authoring bug — loud NrgError.
          if (this.config.completePort) {
            if (
              result !== undefined &&
              (result === null ||
                typeof result !== "object" ||
                Array.isArray(result))
            ) {
              throw new NrgError(
                `input()'s return value is the complete-port record contribution and must be a plain OBJECT of named fields (or void); got ${
                  Array.isArray(result) ? "an array" : `a ${typeof result}`
                }. Name the result — e.g. \`return { count }\`.`,
              );
            }
            // Bind the auto-emit to THIS invocation's store. It runs after the
            // `await` above, so the run() scope has already exited — and Node-RED
            // may have delivered a nested node's message synchronously in the
            // meantime, leaving a DIFFERENT invocation's store ambient. Re-entering
            // this store makes #deliver route through this node's own send. (see
            // #deliver / #emitLifecycle)
            IONode.#invocation.run(store, () =>
              this.#emitLifecycle(
                "complete",
                store.inputMsg,
                (result as Record<string, unknown> | undefined) ?? {},
              ),
            );
          }

          done();
          this.node.log("Input processed");
        } catch (error) {
          const errorMsg =
            error instanceof Error
              ? error.message
              : "Unknown error during input handling";
          const err = error instanceof Error ? error : new Error(errorMsg);

          // A framework NrgError (API misuse — e.g. send() to a built-in
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
              // `stack` (when present) carries the trace. Same MERGE rule as
              // every port: the frame is the PROCESSED RECORD plus `error`, so a
              // handler keeps the full context that failed.
              const stack = error instanceof Error ? error.stack : undefined;
              // Bind to THIS invocation's store — this runs after the `await`, so
              // the run() scope has exited and a nested node's synchronous delivery
              // may have left another invocation's store ambient (see the complete
              // auto-emit above and #deliver).
              IONode.#invocation.run(store, () =>
                this.#emitLifecycle("error", store.inputMsg, {
                  error: {
                    ...errorData,
                    name: (error as { name?: string })?.name ?? "Error",
                    message: errorMsg,
                    ...(stack ? { stack } : {}),
                  },
                }),
              );
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

  public input(msg: TInput): unknown {
    return undefined;
  }

  async #input(msg: TInput, store: InputInvocation) {
    store.inputMsg = msg;

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
    // Expose the off-the-wire channels on THIS node's incoming message, scoped to
    // its package for `private`. Set up per node (re-applied at each hop), so a
    // downstream node from another package reads its own `private` partition —
    // `msg` (already `TInput`) is mutated in place to carry the channel accessors.
    // The channels key off `_msgid`, which the rebase preserves, so a rebased
    // message still resolves the same partitions.
    this.#setupChannels(msg);
    this.#setupMeta(msg);
    // Scope this invocation's input msg + send so a concurrent input() call
    // can't clobber the context this one carries. All per-invocation state
    // lives in the store — there is no shared instance field to race on.
    return await IONode.#invocation.run(store, () =>
      Promise.resolve(this.input(msg)),
    );
  }

  /**
   * Add the `[Channels]` accessor to the incoming message. SYMBOL-keyed, so it can
   * never collide with an author's own message fields and is already invisible to
   * JSON / `Object.keys` / the debug panel (the `enumerable: false` keeps it out of
   * a symbol-aware clone too). Reading `msg[Channels]` yields `{ protected, private }`
   * — proxies over the channel store keyed by the message's `_msgid`, `private`
   * partitioned by this node's package. A core function node gets the bare message
   * and has no accessor — the channels are structurally invisible to the flow author.
   *
   * Mutates `msg` in place (the caller already holds it as `TInput`). A non-object
   * message (never produced by real Node-RED, which always delivers an object) is
   * left untouched.
   */
  #setupChannels(msg: unknown): void {
    if (msg == null || typeof msg !== "object") return;
    const store = this.RED.channelStore;
    const pkg = packageChannel(this.constructor);
    Object.defineProperty(msg, Channels, {
      configurable: true,
      enumerable: false,
      get() {
        const msgid = (this as { _msgid: string })._msgid;
        return {
          protected: channelProxy(store, msgid, NRG_PROTECTED_CHANNEL),
          private: channelProxy(store, msgid, pkg),
        };
      },
    });
  }

  /**
   * Install the read-only `[Meta]` accessor on the incoming message — the typed
   * window onto the framework metadata beside the data (`msg[Meta].source` = the
   * producing node + port). Installed at DELIVERY, like `[Channels]`, over the
   * clone-safe `_meta` root carrier: Node-RED's fan-out clone (messages 2..N)
   * drops symbol properties, so the metadata itself rides an enumerable root key
   * `#wrapOutgoing` stamps. `msg[Meta]` is the STABLE author surface; the carrier
   * is framework-internal. `source` is `undefined` when the upstream producer
   * wasn't an nrg node (a core node, an inject, a bare test message).
   */
  #setupMeta(msg: unknown): void {
    if (msg == null || typeof msg !== "object") return;
    Object.defineProperty(msg, Meta, {
      configurable: true,
      enumerable: false,
      get() {
        return {
          source: (this as { _meta?: { source?: MessageSource } })._meta
            ?.source,
        };
      },
    });
  }

  /**
   * Merge the `protected`/`private` args into this message's channels. Keyed by the
   * outgoing `_msgid`: an input-triggered send inherits it; a source send (no
   * invocation) mints one and stamps it on the outgoing frames so a downstream
   * node reads the same channel. Contributions are STICKY — they persist for the
   * message's journey, so a middle node's plain `send()` keeps them alive.
   */
  #writeChannels(
    protectedData: object | undefined,
    privateData: object | undefined,
    out: unknown[],
    resolvedMsgid: string | undefined,
  ): void {
    if (!protectedData && !privateData) return;
    // Use the msgid already resolved for this emission (see #resolveOutgoingMsgid)
    // so the channel key matches the outgoing frames' `_msgid`. It's `undefined`
    // only for a send with no context on a non-source node (e.g. a timer in a
    // middle node's created()) — mint one here and stamp the frames, exactly as
    // before, in Node-RED's own lineage-id format.
    let msgid = resolvedMsgid;
    if (!msgid) {
      msgid = this.RED.util.generateId();
      for (const m of out) {
        if (m && typeof m === "object") {
          const rec = m as Record<string, unknown>;
          if (rec[MSGID_KEY] === undefined) rec[MSGID_KEY] = msgid;
        }
      }
    }
    const store = this.RED.channelStore;
    if (protectedData) store.merge(msgid, NRG_PROTECTED_CHANNEL, protectedData);
    if (privateData) {
      store.merge(msgid, packageChannel(this.constructor), privateData);
    }
  }

  /**
   * Resolve the `_msgid` for this emission and ensure it's stamped on every
   * outgoing frame. Preference order: the id of the input being processed
   * (a normal hop, already stamped by {@link #withMsgid}); an id already present on
   * a frame; otherwise — for a SOURCE/trigger node only — a freshly minted id
   * (in Node-RED's lineage-id format) stamped on the frames so we can key the
   * channel and freeze the {@link TRANSACTION_ID_KEY}. Returns `undefined` for a
   * contextless send on a non-source node, leaving Node-RED to mint one on
   * delivery (unchanged behavior).
   */
  #resolveOutgoingMsgid(out: unknown[]): string | undefined {
    const inherited = (
      IONode.#invocation.getStore()?.inputMsg as
        | Record<string, unknown>
        | undefined
    )?.[MSGID_KEY];
    if (typeof inherited === "string") return inherited;
    for (const m of out) {
      if (m && typeof m === "object") {
        const id = (m as Record<string, unknown>)[MSGID_KEY];
        if (typeof id === "string") return id;
      }
    }
    if ((this.constructor as typeof IONode).inputs === 0) {
      const minted = this.RED.util.generateId();
      for (const m of out) {
        if (m && typeof m === "object") {
          const rec = m as Record<string, unknown>;
          if (rec[MSGID_KEY] === undefined) rec[MSGID_KEY] = minted;
        }
      }
      return minted;
    }
    return undefined;
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
   * Resolves the context mode for a base-output port from the flow author's
   * per-port config (`config.outputContextModes[port]`, which the editor lets the
   * flow author set on any port), falling back to `"merge"`. Lenient read: only
   * an explicit `"reset"` resets — any other stored value (including the legacy
   * `"passthrough"` from old flows) is `"merge"`.
   */
  #resolveContextMode(port: number): ContextMode {
    return this.config.outputContextModes?.[port] === "reset"
      ? "reset"
      : "merge";
  }

  /**
   * Builds the outgoing message RECORD from this send's named additions:
   * - `merge` (default): `{ ...incoming, ...additions }` — the message is the
   *   flow's shared accumulating record; everything upstream flows on untouched.
   *   The spread of the incoming message drops the non-enumerable `[Channels]`/
   *   `[Meta]` accessors (they are reinstalled at the next delivery) and this
   *   node's `_meta` replaces the previous producer's — THIS node is the source
   *   of the outgoing record.
   * - `reset`: `{ ...additions }` — a fresh record.
   * Both stamp the `_meta` provenance carrier and preserve the incoming `_msgid`
   * (see {@link #withMsgid}) so the lineage id never forks mid-flow. `additions`
   * must be a PLAIN OBJECT of named fields (or nullish = forward the record
   * unchanged) — a scalar or array is an authoring bug, rejected loudly.
   * A fresh object is built per call so multi-port sends never share a reference.
   */
  #wrapOutgoing(value: unknown, mode: ContextMode, port: number): unknown {
    if (value != null && (typeof value !== "object" || Array.isArray(value))) {
      throw new NrgError(
        `send() takes an OBJECT of named fields to merge onto the message record; got ${
          Array.isArray(value) ? "an array" : `a ${typeof value}`
        }. Name the result — e.g. send(port, { count }).`,
      );
    }
    const additions = (value ?? {}) as Record<string, unknown>;
    const meta = { source: this.#outputSource(port) };
    if (mode === "reset") {
      return this.#withMsgid({ ...additions, [META_KEY]: meta });
    }
    // THIS invocation's input record (per-call, concurrency-safe). A send made
    // entirely outside an input() call (e.g. a timer set up in created()) has
    // no scheduling input — the record starts from the additions alone.
    const incoming =
      (IONode.#invocation.getStore()?.inputMsg as Record<string, unknown>) ??
      {};
    const base = { ...incoming };
    delete base[META_KEY];
    return this.#withMsgid({ ...base, ...additions, [META_KEY]: meta });
  }

  /**
   * Build and send a lifecycle-port frame (error/complete/status), MERGING onto
   * the processed record — the same accumulation rule as data ports, so a
   * lifecycle wire keeps the full context (an error handler sees the record that
   * failed). The `_meta.source` stamps the built-in port's REAL slot index in
   * the node's total output layout (base ports first, then the enabled
   * built-ins in error → complete → status order) with the built-in name as
   * `portName` — a lifecycle port is a port like any other. Runs outside the
   * invocation ALS scope (post-resolve / catch), so the incoming `_msgid` is
   * inherited explicitly via {@link #sourceMsgid}. A disabled port is a no-op.
   */
  #emitLifecycle(
    name: "error" | "complete" | "status",
    processed: unknown,
    additions: Record<string, unknown>,
  ): void {
    const port = this.#getBuiltinPortIndex(name);
    if (port === null) return; // the port is disabled — nothing to emit
    const base =
      processed !== null && typeof processed === "object"
        ? { ...(processed as Record<string, unknown>) }
        : {};
    delete base[META_KEY];
    this.#sendToPort(name, {
      ...base,
      ...additions,
      [META_KEY]: {
        source: { ...this.#nodeSource(), port, portName: name },
      },
      ...this.#sourceMsgid(processed),
    });
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
   * The source message's `_msgid` as a spreadable frame fragment — for the
   * built-in complete/error auto-emits, which run AFTER `input()` has resolved,
   * i.e. OUTSIDE the invocation ALS scope, so {@link #withMsgid} (which reads the
   * scope) can't recover it. Stamping it here keeps the lifecycle frame on the
   * SAME lineage id as the data-port emits, so Catch/Complete grouping and any
   * `_msgid` correlation still work. `{}` when the source carries none (a source
   * node) — Node-RED then assigns one, exactly as {@link #withMsgid} documents.
   */
  #sourceMsgid(src: unknown): Record<string, string> {
    const id = (src as Record<string, unknown> | null | undefined)?.[MSGID_KEY];
    return typeof id === "string" ? { [MSGID_KEY]: id } : {};
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
   *
   * The optional `channels` argument writes off-the-wire data to the message's
   * channel store (keyed by its `_msgid`): `protected` targets the package-shared
   * partition, `private` this package's own. It is reachable downstream via
   * `msg[Channels]` and never rides the serialized message. A single object (not
   * positional args) so new channels stay additive.
   */
  public send<P extends OutputPortNames<TOutput> | number>(
    port: P,
    // optional: `send(port)` forwards the record unchanged (merge of nothing)
    msg?: P extends keyof TOutput
      ? PortValue<TOutput[P]>
      : P extends number
        ? // a numeric index into a NAMED record isn't a `keyof`, so type it as the
          // sound union of every port's value (record key order isn't recoverable)
          PortValue<TOutput[keyof TOutput]>
        : unknown,
    // The channels arg is typed against the addressed port's declared ChannelShape
    // (WriteChannels) — same lookup as `msg`, so `send` gives intellisense for the
    // declared keys and enforces a required one, while arbitrary keys stay allowed.
    channels?: P extends keyof TOutput
      ? WriteChannels<TOutput[P]>
      : P extends number
        ? WriteChannels<TOutput[keyof TOutput]>
        : { protected?: object; private?: object },
  ) {
    if (port === "error" || port === "complete" || port === "status") {
      throw new NrgError(
        `send("${port}") is not allowed. Built-in ports are managed by the framework.`,
      );
    }
    // A numeric port addresses a base output port. Reject a negative/non-integer
    // index, and one that would land in a framework-managed built-in port slot
    // (`[baseOutputs, totalOutputs)`) — otherwise author data silently overwrites
    // an error/complete/status frame. A node whose topology wasn't extracted has
    // `baseOutputs === 0` and no built-in slots, so `send(0)` — the documented
    // escape hatch — stays valid (the built-in range is empty).
    if (typeof port === "number") {
      if (!Number.isInteger(port) || port < 0) {
        throw new NrgError(
          `send(${port}) — a numeric output port must be a non-negative integer index.`,
        );
      }
      if (port >= this.#baseOutputs && port < this.#totalOutputs) {
        throw new NrgError(
          `send(${port}) targets a framework-managed built-in port slot (error/complete/status).` +
            (this.#baseOutputs > 0
              ? ` Send to a base output port (0..${this.#baseOutputs - 1}),`
              : ` Send to a base output port,`) +
            ` or use this.status() / this.error().`,
        );
      }
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
          ? `send("${port}") — unknown output port. Valid named ports: ${keys
              .map((n) => `"${n}"`)
              .join(", ")}.`
          : `send("${port}") — this node has no named output ports. Declare named ports with a Port<T> record in the node's Output generic, or send to a numeric port index.`,
      );
    }
    const idx = portIndex ?? 0;
    // `send` is the emission path for every author output (named or dynamic), so
    // opt-in per-port output validation applies here (built-in ports already
    // returned above) — it validates the ADDITIONS this send contributes. A
    // nullish value skips validation: `send(port)` forwards the record unchanged.
    if (msg != null) this.#validatePort(msg, idx);
    this.#sendToPort(
      port,
      this.#wrapOutgoing(msg, this.#resolveContextMode(idx), idx),
      channels,
    );
  }

  #sendToPort(
    port: number | string,
    msg: unknown,
    channels?: { protected?: object; private?: object },
  ) {
    let portIndex: number | null;
    if (typeof port === "number") {
      portIndex = port;
    } else if (port === "error" || port === "complete" || port === "status") {
      portIndex = this.#getBuiltinPortIndex(port);
      if (portIndex === null) return;
    } else {
      portIndex = this.#getNamedPortIndex(port);
      // Defensive: the public send() already threw on an unknown named port,
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
    // Resolve the outgoing `_msgid` once (stamping frames as needed) so the
    // transaction freeze and any channel writes key off the same id.
    const msgid = this.#resolveOutgoingMsgid(out);
    // A SOURCE/trigger node (no input port) originates a transaction: freeze its
    // msgid on the protected channel as a read-only `transactionId`, so every
    // downstream node — which inherits this `_msgid` — can correlate back to this
    // trigger firing and can neither overwrite nor delete it.
    if (msgid && (this.constructor as typeof IONode).inputs === 0) {
      this.RED.channelStore.freeze(
        msgid,
        NRG_PROTECTED_CHANNEL,
        TRANSACTION_ID_KEY,
        msgid,
      );
    }
    // Off-the-wire channel contributions (send's protected/private args), keyed by
    // this message's _msgid. Internal built-in port emissions (status/error/
    // complete) pass none, so this is a no-op there.
    if (channels?.protected || channels?.private) {
      this.#writeChannels(channels.protected, channels.private, out, msgid);
    }
    // Deliver through the invocation-scoped path (concurrency-safe); falls back to
    // node.send outside an input() call (e.g. the built-in port auto-emits).
    this.#deliver(out);
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
    // Same merge rule as every port: the status frame carries the record being
    // processed (when the call happens inside an input()) plus `status`.
    this.#emitLifecycle("status", IONode.#invocation.getStore()?.inputMsg, {
      status,
    } satisfies StatusPortOutput);
  }

  public override error(message: string, msg?: any) {
    if (msg && this.config.errorPort) {
      // The node handles the error via its error port, so it is the sole
      // handler: emit to the port and log the message, but do NOT pass `msg` to
      // Node-RED's error mechanism — that would route the same error to Catch
      // nodes too and stamp `msg.error` on the shared message. Same MERGE rule
      // as the auto-emit path: the frame is the passed record plus `error`.
      this.#emitLifecycle("error", msg, {
        error: {
          // `name` keeps the error-port payload consistent with the auto-emit
          // from a thrown error.
          name: "Error",
          message,
        } satisfies ErrorInfo,
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

  public receive(msg: OmitMessageChannels<TInput>) {
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
