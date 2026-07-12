/**
 * Symbols for the message channels. The channel store partitions each message's data by
 * symbol; the `protected` channel is one shared partition, while the `private` channel
 * is partitioned per package.
 *
 * - `NRG_PROTECTED_CHANNEL` — the single shared `protected` partition, used directly
 *   as a store partition (a node from any package reads/writes it).
 *
 * - `NRG_PRIVATE_CHANNEL` — the DEFAULT `private` partition, used directly as a store
 *   partition for any node that was not registered via `defineModule` (so has no
 *   module id stamp — e.g. the test harness).
 *
 * - `NRG_MODULE_PRIVATE_CHANNEL` — NOT a partition. It's the property key
 *   `defineModule` stamps onto every node class; the VALUE it holds is that
 *   module's own private partition (a fresh per-package symbol). `packageChannel`
 *   reads `NodeClass[NRG_MODULE_PRIVATE_CHANNEL]` to find which partition a node's
 *   `private` channel lives in — falling back to `NRG_PRIVATE_CHANNEL` when unstamped —
 *   so one package's private data is invisible to another package's nodes.
 *
 * All three are `Symbol.for()` — NOT plain `Symbol()` — because the store INSTANCE
 * is shared on `RED` (string-keyed via `RED.channelStore`) but the unit-test harness
 * bundle inlines its own copy of the channel module. A plain `Symbol()` would fork
 * per bundle, so the harness and the runtime would partition the SAME store under
 * different identities and a built consumer's channel reads would silently miss. The
 * global registry keeps one identity across the toolkit/runtime/test bundle split.
 * NOT a security boundary — the keys are reproducible from their public strings.
 */
export const NRG_PROTECTED_CHANNEL = Symbol.for("nrg.protectedChannel");
export const NRG_PRIVATE_CHANNEL = Symbol.for("nrg.privateChannel");
export const NRG_MODULE_PRIVATE_CHANNEL = Symbol.for(
  "nrg.modulePrivateChannel",
);
