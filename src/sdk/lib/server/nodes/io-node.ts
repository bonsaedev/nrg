import type { Schema } from "../../shared/schemas";
import type { RED, NodeRedNode } from "../node-red";
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
import { NRG_PORTS } from "../symbols";
import type {
  OutputPortNames,
  PortValue,
  Port,
  OutputSpec,
  InputSpec,
  NodeSource,
  MessageSource,
  StatusPortOutput,
} from "./types/ports";
import { AsyncLocalStorage } from "node:async_hooks";

/** Per-`input()`-invocation context — see `IONode.#invocation`. */
interface InputInvocation {
  inputMsg: unknown;
  send: (msg: any) => void;
}

/** The clone-safe root carrier for the framework provenance (`{ source }`).
 * Underscore-prefixed like `_msgid`: framework-owned. An ENUMERABLE root key, so it
 * survives Node-RED's fan-out clone (messages 2..N) — a downstream node reads
 * `msg._meta.source` directly, no accessor. The framework stamps it on every `send`;
 * a node that wants to read it declares `_meta: MessageMetadata` on its input port. */
const META_KEY = "_meta";

/** Node-RED's message-lineage id. A node's output inherits its input's value —
 * Node-RED mints a fresh one ONLY when absent — so the framework must carry it
 * forward on every outgoing message rather than let it be regenerated per hop. */
const MSGID_KEY = "_msgid";

/** The build-injected port topology (see `port-topology-injector`). Framework-
 * owned: the injector stamps it under `NRG_PORTS`, non-writable — never set from
 * node code. It is the ONLY source of a node's ports (TS types → topology). */
interface NodePortsDescriptor {
  inputs: 0 | 1;
  outputs: number;
  outputNames?: string[];
}

/**
 * Base class for nodes that process messages. Provides input/output handling,
 * schema validation, status updates, and emit port management.
 *
 * THE MESSAGE IS THE FLOW'S SHARED, ACCUMULATING RECORD. `send(port, additions)`
 * takes an OBJECT of named fields and MERGES it onto the incoming record
 * (`{ ...incoming, ...additions }`), so a field produced by an early node is
 * readable by a late node — nothing is silently lost across hops. Framework
 * provenance rides the `_meta` root key (`msg._meta.source`) — a node reads it only
 * if it declares `_meta` on its port. Built-in lifecycle ports follow
 * the SAME merge rule — an error frame is the processed record plus `error`, a
 * complete frame is the record plus `input()`'s returned fields — so lifecycle wires
 * keep the full context too.
 *
 * The `input()` parameter is the node's `TInput` — an {@link Input}`<Port<…>>`: the
 * wire type. ALWAYS annotate the parameter with this alias — TypeScript does not
 * infer an overridden method's parameter from the base, so an un-annotated
 * `input(msg)` is `any`. To read the producing node, declare `_meta: MessageMetadata`
 * on the port and read `msg._meta.source`. `_msgid` is deliberately not on the
 * parameter — it's framework-internal, not an author-facing field.
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
 *     // merges { result } onto the incoming record (merge default — upstream
 *     // fields flow through):
 *     this.send("out", { result: msg.payload.toUpperCase() });
 *   }
 * }
 * ```
 *
 * @see {@link Input} — the wire port carrying the message type.
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

  /**
   * Build-injected port topology; framework-owned, stamped under `NRG_PORTS` by the
   * port-topology injector (non-writable). `declare` — the value comes only from the
   * injector, so no field initializer is emitted to race it. `@internal` strips it
   * from the published `.d.ts` (the runtime symbol stays for the injector↔runtime
   * handshake; a consumer never sees it in their node types).
   * @internal
   */
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

    // Self-wire the node's OWN Node-RED `input` event to a truly `#private` handler
    // (the base Node self-wires `close`). Keeping it `#private` means no framework
    // symbol is exposed for outside code to reach it.
    this.node.on(
      "input",
      (
        msg: unknown,
        send: (msg: unknown) => void,
        done: (err?: Error) => void,
      ) => this.#inputHandler(msg, send, done),
    );
  }

  /**
   * The `input` event handler body — `#private` and self-wired in the constructor.
   * Awaits {@link Node.createdPromise} so the first input runs only after `created()`
   * settles; the framework needs no external handle to it.
   */
  async #inputHandler(
    msg: unknown,
    send: (msg: unknown) => void,
    done: (err?: Error) => void,
  ): Promise<void> {
    try {
      await this.createdPromise;
    } catch (initError) {
      // Surface the real cause from created() instead of a generic message.
      done(
        initError instanceof Error ? initError : new Error(String(initError)),
      );
      return;
    }

    // Own the invocation store here so the post-`await` auto-emits (complete
    // on return, error on throw) can re-enter it — the ALS run() scope has
    // exited by the time they run (see the complete/error emits below).
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
        // A THROW is the terminal failure: the node's error port is the SOLE
        // handler — emit the frame, log once, and complete WITHOUT reporting to
        // Node-RED's Catch/done-error mechanism. Routing there too would report
        // the error twice (done(err) internally calls node.error(err, msg)) AND
        // stamp `msg.error` on the shared incoming message — a second,
        // differently-shaped error under our `input` frame. (`this.error()` is
        // log-only and never emits the port, so there is nothing to de-dupe.)
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
    // Scope this invocation's input msg + send so a concurrent input() call
    // can't clobber the context this one carries. All per-invocation state
    // lives in the store — there is no shared instance field to race on. The
    // framework provenance rides the incoming message's `_meta` root key (an
    // enumerable field a node reads directly if it declares `_meta` on its port).
    return await IONode.#invocation.run(store, () =>
      Promise.resolve(this.input(msg)),
    );
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
   * Builds the outgoing message RECORD by MERGING this send's named additions onto
   * the flow's shared, accumulating record — `{ ...incoming, ...additions }` — so
   * everything upstream flows on untouched. This node's `_meta` replaces the previous
   * producer's — THIS node is the source of the outgoing record. Stamps the `_meta`
   * provenance carrier and preserves the incoming `_msgid` (see {@link #withMsgid}) so the
   * lineage id never forks mid-flow. `additions` must be a PLAIN OBJECT of named
   * fields (or nullish = forward the record unchanged) — a scalar or array is an
   * authoring bug, rejected loudly. A fresh object is built per call so multi-port
   * sends never share a reference.
   */
  #wrapOutgoing(value: unknown, port: number): unknown {
    if (value != null && (typeof value !== "object" || Array.isArray(value))) {
      throw new NrgError(
        `send() takes an OBJECT of named fields to merge onto the message record; got ${
          Array.isArray(value) ? "an array" : `a ${typeof value}`
        }. Name the result — e.g. send(port, { count }).`,
      );
    }
    const additions = (value ?? {}) as Record<string, unknown>;
    const meta = { source: this.#outputSource(port) };
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
   * message — on every port — stops the id forking at
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
    const portName =
      this.#namedPortKeys()?.[port] ?? this.#builtinPortName(port);
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
   * `throw` for the error port (it carries the record and aborts), and the
   * complete port is sent automatically on successful input processing.
   * (`this.error()` is log-only — it does not emit the error port.)
   */
  public send<P extends OutputPortNames<TOutput> | "error" | number>(
    port: P,
    // optional: `send(port)` forwards the record unchanged (merge of nothing)
    msg?: P extends "error"
      ? // The error port carries an `error` block (an Error, or an object with at
        // least a `message` — matching the ErrorInfo shape a downstream handler
        // reads) plus any record fields to merge. Emitting it explicitly is how a
        // SOURCE node (no input() to throw from) reports a failure on the wire;
        // `throw` remains the convenience for a transformer's terminal failure.
        {
          error: Error | (Record<string, unknown> & { message: string });
        } & Record<string, unknown>
      : P extends keyof TOutput
        ? PortValue<TOutput[P]>
        : P extends number
          ? // a numeric index into a NAMED record isn't a `keyof`, so type it as the
            // sound union of every port's value (record key order isn't recoverable)
            PortValue<TOutput[keyof TOutput]>
          : unknown,
  ) {
    // The complete port is emitted by returning from input(); the status port by
    // this.status(). The error port, by contrast, IS send-able — throw is the
    // transformer's terminal convenience, but a source node (no input()) emits it
    // explicitly with send("error", { error }).
    if (port === "complete" || port === "status") {
      throw new NrgError(
        `send("${port}") is not allowed — the complete port is emitted by returning from input(), and the status port by this.status().`,
      );
    }
    if (port === "error") {
      // Warn + no-op when the error port isn't enabled — NEVER throw. A source
      // node emits this from an async callback where a throw would become an
      // uncaughtException (the crash class the error port exists to avoid).
      const errorIdx = this.config.errorPort
        ? this.#getBuiltinPortIndex("error")
        : null;
      if (errorIdx === null) {
        this.warn(
          `send("error") ignored — this node's error port is not enabled.`,
        );
        return;
      }
      // Normalize the error block to the ErrorInfo contract a handler reads
      // (`name` + `message` [+ `stack`]) — the same shape the throw path emits —
      // so send("error") and throw are interchangeable downstream. Handles an
      // Error instance (name/message/stack are non-enumerable, so layered
      // explicitly) as well as a plain `{ message, … }` object.
      const payload = (msg ?? {}) as Record<string, unknown>;
      const rawErr = payload.error;
      const errBlock =
        rawErr instanceof Error
          ? {
              ...rawErr,
              name: rawErr.name,
              message: rawErr.message,
              ...(rawErr.stack ? { stack: rawErr.stack } : {}),
            }
          : { name: "Error", ...(rawErr as Record<string, unknown>) };
      this.#sendToPort(
        "error",
        this.#wrapOutgoing({ ...payload, error: errBlock }, errorIdx),
      );
      return;
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
            ` throw for the error port, or use this.status().`,
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
    this.#sendToPort(port, this.#wrapOutgoing(msg, idx));
  }

  #sendToPort(port: number | string, msg: unknown) {
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

  /** The built-in port name at an output index — the reverse of
   *  {@link #getBuiltinPortIndex} — so provenance can name an error/complete/status
   *  frame produced via `send()` (e.g. a source node's `send("error")`), the same
   *  way {@link #emitLifecycle} names the auto-emitted lifecycle frames. Returns
   *  `undefined` for a base/data port index. */
  #builtinPortName(port: number): "error" | "complete" | "status" | undefined {
    for (const name of ["error", "complete", "status"] as const) {
      if (this.#getBuiltinPortIndex(name) === port) return name;
    }
    return undefined;
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

  /**
   * Log an error-level diagnostic. LOG ONLY — it does NOT emit the error port
   * and does NOT route to Node-RED `catch`. Those are for TERMINAL failure, which
   * is `throw` (it aborts input() and carries the accumulated record onto the
   * error port). An EXPECTED failure that is a real outcome should be a typed data
   * port (`this.send("rejected", …)`), which carries the signal like any wire.
   * `this.error` is purely observability — the node is still holding the signal
   * and will forward it via `send`/`return`. See the lifecycle/failure model.
   */
  public override error(message: string): void {
    super.error(message); // no msg → logs only, no Catch routing, no port
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
