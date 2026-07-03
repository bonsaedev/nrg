/** Symbol for the internal wireHandlers template method. Not exported from public API.
 * Uses Symbol.for() so the symbol is shared across separate bundles (server + test). */
export const NRG_WIRE_HANDLERS = Symbol.for("nrg.wireHandlers");

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
