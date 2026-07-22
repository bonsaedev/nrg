# The Wire Check

In stock Node-RED, **any output can wire into any input**. A node that emits
`{ payload: "hello" }` connects happily to one that expects a number — the editor
draws a clean wire, the deploy succeeds, and the mismatch only surfaces at
runtime, on the message that hits production at 3am.

nrg closes that gap. Because a node's ports are **typed** (`Port<T>`), nrg can
compile your whole flow and ask the TypeScript compiler whether each connection
actually type-checks — then list the wrong ones in a **Type errors** tab and paint
them **red on the canvas, before the flow ever runs**.

## See it

The same three nodes, wired two ways. On the left every wire type-checks; on the
right the middle node was removed, so `invoice` no longer receives the `customer`
it reads — and that connection is flagged the moment you deploy: listed in the
[**Type errors** tab](#the-type-errors-tab) and painted red on the canvas the
instant you highlight it.

<div style="display:flex; gap:1rem; flex-wrap:wrap; align-items:center;">
  <figure style="margin:0; flex:1 1 320px;">
    <img src="/wire-check/green.png" alt="A flow where every wire type-checks — all wires solid" />
    <figcaption>Every connection type-checks.</figcaption>
  </figure>
  <figure style="margin:0; flex:1 1 320px;">
    <img src="/wire-check/red-missing.png" alt="A flow with a red-dashed wire because a required field is missing" />
    <figcaption><code>invoice</code> reads <code>customer</code>, but nothing upstream adds it.</figcaption>
  </figure>
</div>

## The Type errors tab

Every deploy re-checks the whole flow and lists each failing **connection** in a
**Type errors** sidebar tab — one row per source → reader route, with the exact
TypeScript error underneath. The canvas is left clean until you ask, so a large
flow stays readable and you inspect one problem at a time.

<figure style="margin:0;">
  <img src="/wire-check/type-errors-tab.png" alt="The Type errors sidebar tab listing a failed connection and an unchecked-boundary warning, each with its TypeScript message, plus a Highlight all button" />
  <figcaption>One row per connection — a real type error and an unchecked boundary — each with its <code>tsc</code> message.</figcaption>
</figure>

Click a row's **eye** to *highlight* that connection: its wires paint red (or
yellow, for an unchecked boundary) while the rest of the flow dims away, so you see
exactly which path is wrong. **Highlight all**, at the top, paints every failing
and unchecked wire at once.

<figure style="margin:0;">
  <img src="/wire-check/type-errors-canvas.png" alt="The editor with Highlight all enabled — the failing connection drawn red-dashed and the unchecked one yellow-dashed, valid wires untouched" />
  <figcaption><strong>Highlight all</strong>: the failing wire red, the unchecked wire yellow, valid wires left as-is.</figcaption>
</figure>

## How it works, in one breath

- Your node's **input `Port<T>`** declares the fields it **reads**; its **output
  `Port<T>`** declares the fields it **adds**. See [The Message Model](./message-model).
- On every **deploy**, the whole flow is compiled into a program and handed to
  `tsc`. A wire passes when the record arriving at the target carries every field
  the target reads — with a matching shape — whether that field was added one hop
  back or several.
- Failing connections are listed in the **Type errors** tab; highlight one (or
  **Highlight all**) to paint its wires **red** on the canvas. Connections that
  can't be fully checked (an untyped or non-nrg endpoint) show **yellow-dashed**
  but stay valid.

This is a **deploy-time, whole-flow** check — not a per-wire, while-you-drag one.
Under the accumulating-record model a wire's validity depends on the *entire* path
feeding its target, so the honest moment to check is when the graph is complete.
The [next page](./wire-check-advanced) walks through every verdict with examples.

## Turning it on

The wire check ships as a standalone, opt-in dev dependency — the
`@bonsae/node-red-type-check-plugin` (a server engine plus the editor canvas
painter). Install it and `nrg dev` loads it automatically:

```bash
npm install --save-dev @bonsae/node-red-type-check-plugin
```

Without it, `nrg dev` runs exactly as before — the check is simply off. It never
runs in a production Node-RED; it's an authoring-time safety net.

::: tip Resolved from your own project
The dev launcher resolves the plugin from your project's `node_modules` — it is
**not** bundled with the `@bonsae/nrg` toolkit — so install it in the package
whose nodes you're building, and keep it on the version paired with your nrg
release. If it isn't installed, the launcher logs that it was skipped and carries
on; the check simply fails open, never blocking a deploy.
:::
