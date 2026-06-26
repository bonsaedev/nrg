# Plan: IONode uniform positional-array delivery (nrg v0 breaking change)

Make `IONode` deliver **every** emission as a Node-RED positional array (one slot
per output port), removing the special case where a single-output node delivers a
bare `{ output, … }` object. Node-RED treats `node.send([msg]) === node.send(msg)`
for port 0, so **flow behavior is unchanged** — only the captured/asserted shape
changes. Author-facing `this.send(x)` is **unchanged**.

## The one distinction that controls everything

| Call | Today (single-output) | After | Assertion |
|---|---|---|---|
| `sent()` (no arg) — raw emissions | bare `{output}` | **`[{output}]`** | `sent()[i][0].output` ⟵ **CHANGES** |
| `sent(port)` (number/name) — per-port | `{output}` | `{output}` | `sent(port)[i].output` ⟵ **UNCHANGED** |
| integration `read(port)` / `sent(port)` | per-port `c.msg` | same | **UNCHANGED** |

`sent(port)` already unwraps via `msg[port]`, so **only no-arg `sent()` indexed by
emission changes.** Do NOT blanket-add `[0]` — discriminate per call site.

## Blast radius

| Area | Files | Notes |
|---|---|---|
| runtime `@bonsae/nrg-runtime` | **1** — `io-node.ts` | one conditional in `send()` |
| toolkit harness `@bonsae/nrg` | **1** required (`test/server/unit/index.ts`); integration `flow.ts` optional cleanup, `recorder.ts` no change |
| nrg own tests | **4** break: `emit-ports`, `helpers`, `context-helper`, `io-node` (mock assert). `return-property`, `named-ports`, `runtime.integration` = no change |
| nrg docs | **~6** (`docs/guide/testing.md` heaviest); discriminate no-arg vs `read()`/`sent(port)` examples |
| salesforce | **7** unit test files (no-arg `sent()[i]` sites); integration = verify-only |
| file-storage | **3** test files (no-arg `sent()[i].output`) |
| lambda-runtime, aws, cli, cli-compiler, benchmarks, create-nrg | **0** (author-facing only) |

## Phase A — runtime (`io-node.ts`), first

Rewrite `send()` (≈303–321) to a single always-array path:
```ts
public send(msg: TOutput) {
  const multi = this.baseOutputs > 1 && Array.isArray(msg);  // keep the guard
  const values = multi ? (msg as unknown[]).slice(0, this.baseOutputs) : [msg];
  const out = values.map((m, port) => {
    if (m == null) return m;                 // preserve sparse/null slots
    this.#validatePort(m, port);
    return this.#wrapOutgoing(m, this.#resolveContextMode(port), port);
  });
  this.#deliver(out);                        // ALWAYS an array
}
```
- Preserves: single `send(x)`→`[wrap(x,0)]`; `send(null)`→`[null]`; multi `send([a,b])` unchanged; **single-output array value** `send(["a","b"])`→`[wrap(["a","b"],0)]` (guard `baseOutputs > 1` — do **not** broaden to `Array.isArray(msg)` alone).
- `#deliver`, `#sendToPort`, `#wrapOutgoing`, WIRE_HANDLERS, getters, `status()/error()`, types: **no code change** (JSDoc only on `#deliver`/`#sendToPort`).

Gate: `pnpm --filter @bonsae/nrg-runtime build && typecheck`.

## Phase B — toolkit harness (`test/server/unit/index.ts`)
- numeric-port branch (≈line 136): drop `port === 0 ? msg : undefined` → `undefined` (or `msg?.[port]`); keep `!= null` filter.
- no-arg overload type: `sent(): TOutput extends unknown[] ? TOutput[] : [TOutput][]` (pragmatically `unknown[][]`).
- `sent<P>(port)` / `sent(port: number)` overloads: **unchanged**. `PortNames`/`PortMessage`/`ExtractOutput`: **unchanged** (reject the survey's `ExtractOutput→[O]` idea — it mis-types the per-port overloads).
- `mocks.ts` comment only; integration `flow.ts` optional `#wrapSend` dead-`else` removal; `recorder.ts` no change.

Gate: `pnpm --filter @bonsae/nrg test` fully green.

## Phase C — nrg own tests (edit only these)
- `emit-ports.test.ts` **line 475**: `expect(sent[0])` → `expect(sent[0][0])`. All `Array.isArray(s) && s[1]?.error/status` filters **stay**.
- `helpers.test.ts` **line 394**: `node.sent().map(m => m.output)` → `…map(m => m[0].output)`. All `sent(0)/sent(1)` lines stay.
- `context-helper.test.ts` **line 29**: `node.sent()[0].output.count` → `node.sent()[0][0].output.count`.
- `io-node.test.ts` **218, 228**: `toHaveBeenCalledWith({output:…})` → `toHaveBeenCalledWith([{output:…}])`. Throw-tests (256/259/285/288/311) stay.
- `return-property.test.ts`, `named-ports.test.ts`, `runtime.integration.test.ts`: **no change** (per-port / count-only).

## Phase D — docs
- `docs/guide/testing.md`: document `sent()` returns positional arrays; **keep `read()`/`sent(port)` examples as-is** (per-port). Change only no-arg `sent()[i]` examples. API table + prose at 188–204/606/613–615.
- `packages/toolkit/README.md`: `sent(0)` and `read().output` examples **stay** (per-port); only change a no-arg `sent()[i].output` if present.
- `docs/guide/schemas.md`, `creating-a-node.md`: short note. Others + `runtime/README.md` + create-nrg templates: verify-only / unaffected.

## Phase E — consumers (only after nrg published)
Apply the **discriminated** rule (no-arg `sent()[i].output` → `sent()[i][0].output`; `sent(port)` stays):
- **salesforce** (7 files): `salesforce-{dml,bulk,apex-invocation,describe,soql,apex-code,streaming}.test.ts` — the listed `sent[i]`/`node.sent()[i]` no-arg sites → `…[i][0]…`. `event-handler.test.ts`/`timer.test.ts` = verify-only (per-port / counts).
- **file-storage** (3 files): `file-{read,write,watch}.test.ts` — `node.sent()[i].output.*` → `node.sent()[i][0].output.*`.
- others: no change.
- **Caveat:** read each site in context — confirm it's `const sent = node.sent()` (no-arg), not `node.sent(0)`. Do not sed-blanket.

## Phase F — release & adoption sequencing
1. Land A–D as **one** nrg breaking commit (keeps nrg CI green at publish). No `feat!`/`BREAKING CHANGE` footer (memory) — normal subject + body prose.
2. Publish nrg; wait for the version.
3. Per consumer: bump nrg **and** apply Phase-E edits in the **same commit** (consumer CI green against the new harness). Order: salesforce, file-storage; others just bump.
4. Follow push/CI memory: rebase onto the release commit; pre-push = full CI (webkit flaky → `--no-verify` only after independent green); **no push without approval**.

## `outputs()` convenience — DEFER
Recommend not adding now. `sent(port)` already gives per-port access; an ergonomic
unwrapped `outputs(port = 0): O[]` is orthogonal and would pull in the
`ExtractOutput` type work this plan avoids. Follow-up enhancement if wanted (lives
in the unit harness; no integration equivalent — `read()` already returns the
per-port message).

## Human-decision checkpoints
1. **Integration `read()` stays per-port** — ✅ **CONFIRMED.** `(await node.read()).output` and `node.sent(0)` keep returning the per-port message, not an array. Only no-arg `sent()` becomes uniform arrays.
2. **`outputs()` accessor** — ✅ **DEFERRED.** Not built in this change; follow-up enhancement only.
3. salesforce `event-handler`/`timer` (multi-port `sent(port)` / counts) — verify post-publish.
4. `flow.ts #wrapSend` dead-`else` cleanup — now or leave the harmless branch.
5. create-nrg `examples/README.md`, `project/README.md.hbs` — grep for no-arg `sent()[i].output`; edit only if present.

**Execution status:** HOLD — plan delivered, not yet executing per user (2026-06-23).

## Net
Runtime ≈10-line change; the real work is **disciplined, discriminated** assertion
edits across 4 nrg test files + ~10 consumer test files + ~6 docs, gated on an nrg
publish before consumer bumps. Two survey traps explicitly rejected: do **not** add
`[0]` to `sent(port)` sites, and do **not** convert integration `read()`/`sent(port)`
to array-returning (gratuitous rework).
