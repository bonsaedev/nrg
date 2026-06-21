# `internal/` — test-support surface (not public API)

These modules are **not public API**. They exist so `@bonsae/nrg`'s published
test utilities (`@bonsae/nrg/test/*`) can reach the framework internals they
need to exercise a consumer's nodes:

- **`server/`** — Node-side internals (the wiring symbol, context setup,
  validator init, and internal types) used by the server unit/integration test
  harness.
- **`client/`** — the form composables (`index`, kept `.vue`-free) and the real
  Vue form components (`components`) used by the component test harness.

## Why they ship in the published package

A consumer testing their nodes imports `@bonsae/nrg/test/*`, which at runtime
imports these from the **installed** `@bonsae/nrg-runtime`. The test harness has
to operate on the **same** runtime instance the consumer's nodes use — the
`WIRE_HANDLERS` symbol and `instanceof` checks only hold when both sides share
one copy. So these can't be bundled into the toolkit; they must be a real,
importable part of this package. (There's no such thing as a published-but-hidden
export — anything in `exports` is importable.)

This is the same pattern as `svelte/internal` and `@angular/core/testing`:
shipped, importable, but not part of the supported API.

## Stability

**No semver guarantees.** Don't import `@bonsae/nrg-runtime/internal/*` directly
in your own code — use the documented `@bonsae/nrg/test/*` utilities instead.
These entry points can change in any release.
