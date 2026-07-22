# Reading the Verdicts

This page walks through every verdict the wire check produces — a clean wire, a
red failure, and a yellow warning — plus how it handles branches, junctions, and
cleared fields. If you haven't yet, read [The Wire Check](./wire-check) for the
one-paragraph version.

::: tip A valid wire has no special colour
The check only paints **problems**. A connection that type-checks is left exactly
as Node-RED draws it — a solid **grey** wire — so "no colour" is the all-clear.
There is no green wire; only red (failure) and yellow (unverifiable) are painted.
:::

## How a wire contract is made

Three tiny nodes carry the whole page. Each declares only what it **reads** (its
input `Port<T>`) and what it **adds** (its output `Port<T>`):

```ts
// a shared data type
interface Order { id: string; total: number }
interface Customer { id: string; name: string }

// SOURCE — no input; ADDS `order`
class Source extends IONode<never, never, never,
  Outputs<{ out: Port<{ order: Order }> }>> {}

// ENRICH — READS `order`; ADDS `customer`
class Enrich extends IONode<never, never,
  Input<Port<{ order: Order }>>,
  Outputs<{ out: Port<{ customer: Customer }> }>> {}

// INVOICE — a sink that READS `order` AND `customer`
class Invoice extends IONode<never, never,
  Input<Port<{ order: Order; customer: Customer }>>, never> {}
```

The message is one **accumulating record**: each node merges its adds onto what
arrived, so a field added early keeps flowing. `Enrich` never mentions `order` on
its output — the framework carries it through. A wire passes when the record
arriving at the target holds every field the target reads, with a matching shape.
(See [The Message Model](./message-model) for the record itself.)

## A connection that type-checks

```
Source ──▶ Enrich ──▶ Invoice
```

<img src="/wire-check/green.png" alt="Every wire solid grey — the flow type-checks" style="max-width:640px" />

`Invoice` reads `order` **and** `customer`. By the time the record reaches it,
`order` was added by `Source` (two hops back, carried through `Enrich`) and
`customer` by `Enrich`. Both present, both the right shape → every wire
type-checks, so every wire is left its plain solid grey.

## Red — a missing field

Drop `Enrich` and wire `Source` straight into `Invoice`:

<img src="/wire-check/red-missing.png" alt="A red-dashed wire because customer is missing" style="max-width:520px" />

Nothing adds `customer`, so the connection reds. The log names the exact reader
and the missing field:

```
✖ order[out] -> invoice
    Property 'customer' is missing in type '{ order: { id: string; total: number } }'
    but required in type '{ order: { id: string; total: number }; customer: { id: string; name: string } }'.
```

## Red — a wrong-type field

A same-named field with the wrong shape is caught too. Here a source adds `order`
as a plain `string`, wired into a node that reads `order` as an `Order`:

<img src="/wire-check/red-conflict.png" alt="A red-dashed wire because order has the wrong type" style="max-width:520px" />

```
✖ order = string[out] -> ship
    Types of property 'order' are incompatible.
    Type 'string' is not assignable to type '{ id: string; total: number }'.
```

## Yellow — an unverifiable boundary

A yellow-dashed wire is **not** a failure — it's a connection the checker can't
fully verify because one endpoint is untyped. The wire stays valid; the caveat is
just made visible.

Two things cause it. An nrg node with an **untyped output** (`Port<any>` /
`Port<unknown>`) feeding a typed reader:

<img src="/wire-check/yellow-untyped.png" alt="A yellow-dashed wire from an untyped source" style="max-width:520px" />

```
⚠ untyped source[out] -> invoice
    'untyped source' is an untyped output — the message it sends can't be checked
    against what 'invoice' reads.
```

…and any wire touching a **core / non-nrg node** (an `inject`, a `function`, a
third-party node), which has no nrg types at all — so it's a boundary in either
direction:

<img src="/wire-check/yellow-core.png" alt="A yellow-dashed wire from a core inject node" style="max-width:520px" />

::: tip The one exception
A reader whose input is `Port<any>` / `Port<unknown>` is a deliberate accept-all
passthrough — a wire **into** it never warns, whatever the source.
:::

::: warning "Adds nothing" is `Port<{}>`, not `Port<any>` — and not `never`
A node that only observes and forwards declares its output **`Port<{}>`** (adds
nothing): it stays **green**, forwarding the record unchanged with everything
downstream still fully checked. `Port<any>` means "adds _something_ unknown" and
yellows here, and `never` removes the output port entirely (a sink). See
[port topology](./creating-a-node).
:::

## Branches

### Fan-out — one output, many wires

A source's output can feed several targets. Each wire is checked **independently**
against its own target, so one fork can pass while another fails:

<img src="/wire-check/branch.png" alt="A source forking to a passing wire and a failing wire" style="max-width:600px" />

`order` reaches both. `ship` (reads `order`) passes; `invoice` (also needs
`customer`) fails — on the very same fork.

### Fan-in — many wires, one reader

Node-RED delivers each incoming message **separately** — a fan-in node fires once
per arriving message, never a merge of them. So each incoming wire is checked on
its own against what the reader needs: one connection, one verdict. All three can
land on the same node at once:

<img src="/wire-check/fan-in.png" alt="Three arms into one reader — one grey (valid), one red, one yellow" style="max-width:680px" />

Into the same `invoice`: the `order + customer` arm carries everything it reads
(solid grey — valid), the `order`-only arm is missing `customer` (red), and the
untyped arm can't be checked at all (yellow). Downstream of a join, only fields
present on **every** arm are guaranteed — the conservative, sound shape.

## Junctions

A Node-RED **junction** lets you branch tidily: one wire in, then the junction
fans the message — unchanged — out to several targets. The checker treats it as a
transparent pass-through: it **splices the junction out** and checks each real
endpoint *through* it.

<img src="/wire-check/junction.png" alt="One wire into a junction, branching to a passing and a failing reader" style="max-width:640px" />

`order` reaches both branches through the junction. `ship` (reads `order`) passes;
`invoice` (also needs `customer`) fails. And the wire **into** the junction reds
too — a path running through it fails, and the check paints whole paths, not
single hops. A junction never hides a type error, and never counts as an untyped
boundary.

## Removing a property

There's no structural delete on the wire; the supported "remove" is to send a
field as `undefined`, typed `Port<{ field: undefined }>`:

```ts
// CLEAR — READS `customer`, then blanks it
class Clear extends IONode<never, never,
  Input<Port<{ customer: Customer }>>,
  Outputs<{ out: Port<{ customer: undefined }> }>> {}
```

Whether that reds depends on the **reader**. A reader that **requires** the field
reds — clearing took away what it needs:

<img src="/wire-check/red-cleared.png" alt="Clearing customer reds the required invoice reader" style="max-width:720px" />

```
✖ clear customer[out] -> invoice
    Types of property 'customer' are incompatible.
    Type 'undefined' is not assignable to type '{ id: string; name: string }'.
```

A reader that treats the field as **optional** (`customer?`) stays valid — its
wire untouched — because an absent value is fine for it:

<img src="/wire-check/green-cleared-optional.png" alt="Clearing customer is fine for an optional reader" style="max-width:720px" />

This mirrors runtime exactly: the record merges (`{ ...incoming, ...additions }`),
so at runtime `customer` becomes `undefined`, not deleted — readers should test the
value, not key-presence. See [The Message Model](./message-model).
