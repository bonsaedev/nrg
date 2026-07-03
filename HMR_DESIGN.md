# HMR for `@bonsae/nrg` — design notes / plan (DRAFT, untracked)

> Status: research output, **not committed**, kept for later refinement. Produced from a 3-agent
> research workflow (client Vue HMR, server Node-RED HMR, prior-art) + synthesis, all verified
> against source. See memory `project_nrg_hmr_plan`.

## 1. Reality check — what `pnpm dev` does today (NOT HMR)

`pnpm dev` = `vite --mode development`. In serve mode the `nrg()` plugin activates `serverPlugin`
(`src/vite/plugins/server.ts:126`, `apply: "serve"`):

- **Every edit → full teardown.** One chokidar watcher (`server.ts:204-223`) on
  `serverSrcDir`/`clientSrcDir`/`resourcesDir`; ANY change debounces (~1s) into `start(false)` —
  **no client/server discrimination**.
- **`start()` kills + respawns Node-RED.** `server.ts:57-99`: `nodeRedLauncher.stop()` → rebuild
  BOTH bundles → `nodeRedLauncher.start()`. NR is a spawned **child process**.
- **Browser loads NR's page, not Vite's.** `appType:"custom"` (`:130`) + catch-all proxy `"^/.*"`
  `ws:true` (`:133-151`). Vite serves no HTML.
- **Vite HMR/watcher deliberately off.** `server.watch.ignored:["**/*"]` (`:152-155`).
- **Client is a static lib bundle.** `buildClient` runs `vite build --lib` (`build.ts:200-205`);
  `vue`/`@bonsae/nrg/client` externalized to `/nrg/assets/*`. No `import.meta.hot`, no
  `@vite/client`, no `__hmrId`.
- Verified: grep for `import.meta.hot|@vite/client|server.ws|moduleGraph|full-reload|handleHotUpdate`
  across `src/` → **zero hits**. No HMR scaffolding exists.

Net: edit → rebuild both bundles → **restart the whole NR process** → **manual hard refresh**. Open
edit-dialog state (`node._newState`, `form/index.ts:51`) is lost; only flows survive (NR storage).

## 2. Verdict

- **Client (Vue forms): achievable.** Vue component HMR preserves reactive state in place. Biggest
  obstacle: editor page is **NR's HTML served through the proxy**, so Vue modules never pass through
  Vite. Must inject `@vite/client` into NR's proxied page + share the single `/nrg/assets` Vue
  instance (Vue HMR no-ops with two Vue instances). Top unknown: Vite HMR WS coexisting with NR's WS
  under `ws:true`.
- **Server (own NR entrypoint): partial.** Can embed NR in-process (`RED.init/start/stop` exported;
  `red.js` is a thin embed wrapper) and hot-swap ONE node type via registry `removeModule`/`addModule`
  — **provided each reload emits the bundle to a NEW filename** (`loader.js` does
  `import(pathToFileURL(file))` with no cache-bust; Node can't evict the ESM cache). L-effort,
  semi-internal APIs (`addModule`/`removeModule`), later/riskier. General in-process require-reload: NO.

## 3. Phased plan (each independently shippable; S < M < L < XL)

- **M0 (S, recommended first, no spike):** split the chokidar handler — client-only edits rebuild
  ONLY the client (`buildClient`, ~hundreds ms) and **skip** the NR restart. Establishes the
  change-classification seam M1–M4 all need. Risk: a "client" file that feeds a server-baked schema
  (`virtual:nrg/node-definitions` is computed from the SERVER bundle) → treat schema-affecting changes
  as server changes.
- **M1 (M):** automatic full-page reload via Vite WS. `proxy.on("proxyRes")` (net-new — only
  `proxy.on("error")` exists at `server.ts:139`) decompresses NR's editor HTML and appends
  `<script type=module src="/@vite/client">`; `server.hmr={path:"/__nrg_hmr"}` + proxy bypass for
  `/@vite/`, `/@id/`, `/@fs/`, the HMR WS path; `server.ws.send({type:"full-reload"})` after a client
  rebuild. Kills the manual hard-refresh. Risk: proxy/WS coexistence (Spike A); gzipped foreign-HTML
  rewrite (Spike B).
- **M2 (M):** scoped form/def reload without full page reload — emit defs/forms as separate hashed
  chunks; forms-only edit pushes a custom WS event → re-fetch chunk → `__setForms` → re-mount open
  dialog snapshotting/restoring `node._newState`. Must swap the form component only, never
  re-`registerType`.
- **M3 (L/XL, stretch):** true Vite+Vue HMR — serve client as ESM in serve mode (gate lib mode to
  build/preview), `@vitejs/plugin-vue` HMR boundaries, virtual entry module with
  `import.meta.hot.accept`, externals aliased to the `/nrg/assets` singletons. Risk: Vue-singleton
  dedupe (Spike D), foreign-page transform, dev-vs-build divergence.
- **M4 (L/XL, stretch):** single-node server hot-swap — NEW `src/vite/node-red-host/` (in-process
  embed: Express + `http.createServer` + `RED.init/start/stop`, mount `httpAdmin`/`httpNode`,
  `reloadModule()`/`hardRestart()`); dev "hot" build emits content-hashed `index.<hash>.mjs`; on
  server edit: `stopFlows` → `registry.removeModule` → `registry.addModule` → `startFlows`. Cold-path
  fallback (`RED.stop()/start()`) for settings/credential-schema/new-type/NR-version. Keep
  `embed:false` escape hatch to the current spawn model. Risk: ESM cache leak, `registerType` "already
  registered", in-flight message loss, config-node/credential persistence, semi-internal API stability.

## 4. Spikes (de-risk before committing)

- **A — proxy/WS coexistence (gates the whole client track):** inject `@vite/client` into the proxied
  NR page, set `server.hmr.path`, add bypasses; confirm Vite's HMR WS lives alongside NR's comms WS
  without either upgrade handler clobbering the other.
- **B — foreign-HTML rewrite:** confirm NR's editor tolerates an injected `@vite/client` tag and the
  gzipped/chunked proxied response can be cleanly decompressed + rewritten (`selfHandleResponse`).
- **C — Vue HMR into an NR-cloned dialog (gates M3):** does Vue SFC HMR preserve `node._newState` for
  an app mounted via `createApp` into NR's cloned `data-template-name` template, or does the
  `$('#container').empty()` + clone cycle in `mountApp` defeat instance reuse?
- **D — Vue singleton dedupe (gates M3):** can dev-served components share the same Vue instance as
  the externalized `/nrg/assets` Vue (single `__VUE_HMR_RUNTIME__`)?
- **E — in-process embed + registry swap (gates M4):** `require('node-red')`, `RED.init`+`start`
  against `dist/`, then `removeModule`+`addModule` after rewriting the bundle to a new filename;
  confirm `registerType` re-runs with fresh code, flows redeploy, the open editor survives, and
  `RED.stop()`+`RED.start()` is cleanly re-init-able in-process (i18n/event singletons).

## 5. Recommended next step

**Build M0** (split the chokidar handler) — S, low-risk, reversible, no spike — then run **Spike A**
in parallel (its outcome decides whether the client-HMR track M1→M3 is viable before further
investment).

## Honest framing (docs/users)

Short term: client-tier wins + not restarting NR for client edits. **Server logic edits keep
restarting** for the near term — communicate M4 as experimental/later, never a near-term guarantee.
The guide docs were corrected to state plainly that the current loop is "not HMR".

---

# M4′ — Server HMR via stable-shell / swappable-impl (validated 2026-06-28)

> Supersedes M4's "registry surgery". Validated against nrg + Node-RED 5 source
> (workflow `wf_b2693bf6-778`). **Build Spike A first — it's the make-or-break.**

## The load-bearing correction
The instinct (keep the node registered, swap only its execution layer) is **right**, but the
swap target matters:
- **WRONG (silent no-op):** replace the NR registry entry `nodeConstructors[type]`. NR binds each
  instance's input dispatch to a closure **once at construction** (`Node.js:158-177,214`); it never
  re-reads the registry per message. Replacing the constructor only affects the *next* `createNode`
  (a future deploy), and `registerNodeConstructor` even throws "already registered" for a live type.
- **RIGHT:** swap **`this.input`** (and `created`/`closed`) — the per-message-dereferenced instance
  methods. nrg's dispatch is `bound on("input")` → `this.#input` (`io-node.ts:255`) → `this.input(msg)`
  (`io-node.ts:350`), resolved fresh per message. Re-point a mutable `#impl` the public hooks delegate
  to and the **very next message runs new code** — no redeploy, no new instance, state preserved.

## Why it's buildable on seams nrg already owns
- The trampoline already exists: `def.input.call(this, msg)` / `def.created.call(this)` /
  `def.closed.call(this, removed)` (`factories.ts:101-109`). The impl chunk just exports
  `{ input, created, closed }` plain fns that take the shell instance as `this`.
- **One stable class, statics pinned.** `this.constructor as typeof IONode` is read in ~10 hot paths
  for statics (io-node.ts:213,227,335,396; node.ts:179) — so NEVER swap the class; swap function refs
  only. Recommended: a **module-level `currentImpl[type]` ref** (O(1) swap; no instance walk).
- Stable = everything `registerType` froze + every editor-read static (type/category/color, all
  `*Schema`, port arity, credentials/settings). Swappable = the 3 user methods + their module top-level.

## Semantics
- **created() does NOT re-run on swap** — instance state (connections, config nodes, `this.*`) is
  preserved; next `input()` runs new code. Footgun if authors move init between created()/input() →
  document + offer optional `onSwap(prevImpl)`. **closed() runs latest impl at real teardown only.**
- **Instance state survives; module top-level resets** (fresh `import()` of a hashed file) — falls out
  for free. In-flight messages finish on the old impl (ALS-isolated per call, io-node.ts:349); capture
  `#impl` once at dispatch entry.
- Config-node changes + dynamic-output arity drift ⇒ **fall back to restart in v1.**

## Mechanics
- **Dev split-build:** stable shell+registration bundle (loaded by NR once, byte-stable across edits)
  + a per-build **hashed impl chunk** `.nrg/impls/<type>.<hash>.mjs` exporting `{input,created,closed,
  fingerprint}`. New filename mandatory (no ESM cache-bust: `import(pathToFileURL)` everywhere). Prod
  bundle UNCHANGED; indirection gated on `isDev`.
- **Signal:** a dev-only `RED.httpAdmin.post("/nrg/dev/swap", …)` endpoint (reuses nrg's existing
  `initRoutes`/routes.ts pattern; the spawn model has **no IPC** — process.ts:21-27). Vite POSTs on an
  impl-only change; non-200 ⇒ vite falls back to `start(false)`. Hard-gate on `isDev` + 127.0.0.1
  (a code-loading POST in prod = RCE). Embedding NR later collapses this to a direct call.
- **Change-classifier / fingerprint** (the correctness lynchpin): the impl chunk exports a fingerprint
  over every registered/editor-read field; swap only if it matches the boot-captured value, else
  restart. **Default to restart on any uncertainty** (a missed field = "works until you touch a wire").
- **ESM-leak mitigation:** swap counter → periodic full restart (e.g. every N swaps); GC old
  `.nrg/impls/*` keeping live+previous.

## Spikes (priority)
- **A (make-or-break, ~½ day, no build/HTTP):** in-process — shell delegates `input` to a module-level
  ref; deploy 1 instance, set `this.count` in created(), swap the ref to a v2 body, send a message →
  assert returns v2, `this.count` survived, created() NOT re-run, same instance identity (no redeploy);
  fire two straddling messages → first completes on v1's ALS-captured send, second on v2. **If A fails,
  the design is dead → fall back to full restart.**
- **B:** two-entry dev build → byte-stable shell + hashed impl resolving the SAME `@bonsae/nrg/server`
  identity (Symbol.for keys cross-bundle, symbols.ts:3).
- **C:** the `RED.httpAdmin` swap endpoint across the spawn boundary; measure save→swap latency vs
  today's rebuild+respawn (must be sub-second to justify the complexity).
- **D:** classifier — input-body edit ⇒ swap; port rename / config-field add ⇒ restart.

## vs M4
M4 (replace `nodeConstructors[type]`) is a **no-op for live instances** and would need a redeploy
(destroying instance state). M4′ targets the real dispatch seam → state-preserving, zero NR API
changes. Cost: more code (split build + HTTP signal + fingerprint) vs M4's single assignment. Both
share the unavoidable ESM-leak (bounded by periodic restart).
