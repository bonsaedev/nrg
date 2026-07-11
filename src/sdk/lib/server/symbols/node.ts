/**
 * Symbols for the internal per-kind Node-RED handler setup. Not exported from the
 * public API. These are symbols (rather than `#` private methods) for the ONE thing
 * `#` can't do here: be invoked across module boundaries — the registrar's static
 * context and the test harness both call them. `Symbol.for()` keeps them the same
 * across the server + test bundle split.
 *
 * The base `Node` sets up the `close` handler (every node kind); `IONode` adds the
 * `input` handler. They're split into two symbols so each takes only what it needs:
 * `close` needs nothing, `input` needs the post-construction `createdPromise`.
 */
export const NRG_SETUP_CLOSE_HANDLER = Symbol.for("nrg.setupCloseHandler");
export const NRG_SETUP_INPUT_HANDLER = Symbol.for("nrg.setupInputHandler");

/**
 * Runtime NRG-node brand: stamped on the base `Node` class (`static [NRG_NODE] =
 * true`) and checked by `defineModule` at runtime. `Symbol.for()` — NOT a `unique
 * symbol` — so the guard reads it across the toolkit/runtime/test bundle split via
 * the global registry (a `unique symbol`'s identity is per-`.d.ts`-declaration and
 * would fragment across nrg's separately bundled types, which is also why this is
 * deliberately NOT a compile-time type key — the runtime guard is the real,
 * cross-bundle-safe gate).
 *
 * NOTE: this is NOT a security boundary. `Symbol.for("nrg.node")` is reproducible
 * by anyone, so the brand can be forged; it is a *nominal dev-time marker* that
 * distinguishes nrg node classes from arbitrary objects in trusted node-author
 * code, not a defense against malicious input.
 */
export const NRG_NODE = Symbol.for("nrg.node");

/**
 * Runtime config-node brand: a real instance property (`[NRG_CONFIG_NODE] = true`)
 * on every `ConfigNode`. Lets runtime code — the config proxy's NodeRef
 * resolution — verify a referenced node is actually a config node. That runtime
 * check is the ONLY guard a JS author gets; the `ConfigNodeBrand` string key is
 * compile-time only (TS `NodeRef<T>`). `Symbol.for()` so it's recognized across
 * bundles. Like `NRG_NODE`, it is a nominal marker over trusted author code, not
 * forgery-proof (the symbol is reproducible from its public key).
 */
export const NRG_CONFIG_NODE = Symbol.for("nrg.configNode");

/**
 * Build-injected port-topology key. The port-topology injector stamps
 * `Object.defineProperty(NodeClass, NRG_PORTS, { value, writable:false,
 * configurable:false })` from the node's `Input`/`Output` generics; io-node's
 * `inputs`/`outputs`/`outputPortNames` getters read it. `Symbol.for()` so the
 * consumer build (which injects) and the runtime (which reads) resolve the same
 * symbol across the bundle split — the injector emits the literal
 * `Symbol.for("nrg.ports")`, so keep the key string in sync. Like the brands
 * above this is NOT a security boundary; the non-writable lock only prevents an
 * accidental clobber of a value the runtime routes ports on.
 */
export const NRG_PORTS = Symbol.for("nrg.ports");
