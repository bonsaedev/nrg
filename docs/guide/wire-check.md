# The Wire Check

In stock Node-RED, **any output can wire into any input**. A node that emits
`{ payload: "hello" }` connects happily to one that expects a number — the editor
draws a clean wire, the deploy succeeds, and the mismatch only surfaces at
runtime, on the message that hits production at 3am.

nrg closes that gap. Because a node's ports are **typed** (`Port<T>`), nrg can
compile your whole flow and ask the TypeScript compiler whether each connection
actually type-checks — then paint the wrong wires **red on the canvas, before the
flow ever runs**.

## See it

The same three nodes, wired two ways. On the left every wire type-checks; on the
right the middle node was removed, so `invoice` no longer receives the `customer`
it reads — and that connection is painted red the moment you deploy.

<div style="display:flex; gap:1rem; flex-wrap:wrap; align-items:center;">
  <figure style="margin:0; flex:1 1 320px;">
    <img src="/wire-check/green.png" alt="A flow where every wire type-checks — all wires solid" />
    <figcaption>✅ Every connection type-checks.</figcaption>
  </figure>
  <figure style="margin:0; flex:1 1 320px;">
    <img src="/wire-check/red-missing.png" alt="A flow with a red-dashed wire because a required field is missing" />
    <figcaption>🔴 <code>invoice</code> reads <code>customer</code>, but nothing upstream adds it.</figcaption>
  </figure>
</div>

## How it works, in one breath

- Your node's **input `Port<T>`** declares the fields it **reads**; its **output
  `Port<T>`** declares the fields it **adds**. See [The Message Model](./message-model).
- On every **deploy**, the whole flow is compiled into a program and handed to
  `tsc`. A wire passes when the record arriving at the target carries every field
  the target reads — with a matching shape — whether that field was added one hop
  back or several.
- Failing wires paint **red**; connections that can't be fully checked (an
  untyped or non-nrg endpoint) paint **yellow-dashed** but stay valid.

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
