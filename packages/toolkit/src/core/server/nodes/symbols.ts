/** Symbol for the internal wireHandlers template method. Not exported from public API.
 * Uses Symbol.for() so the symbol is shared across separate bundles (server + test). */
export const WIRE_HANDLERS = Symbol.for("nrg.wireHandlers");
