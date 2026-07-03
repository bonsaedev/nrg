# Custom Validators — design notes (paused, reverted 2026-06-27)

Scratch doc capturing the `defineValidators` design we built and then backed out,
so we can pick the discussion back up later. The code was removed; this is the
record of approaches + open questions. (NodeRef unification and the
`src/core/shared` decoupling were kept — they're independent.)

## Goal

Let node authors add custom validation logic (beyond JSON-Schema constraints)
that runs on **both planes**: the editor form (live inline errors) and the
server runtime (on deploy). Author the predicate once.

## API surface (what we prototyped)

```ts
// src/shared/validators.ts  (dual-plane, imports only from "@bonsae/nrg" root)
export default defineValidators({
  validators: [
    // field validator — receives the field value
    { keyword: "non-empty", schemaType: "string",
      validate: (args, value, ctx) => boolean, message?, plane? },
    // object validator — receives the whole object, returns true | issues
    { keyword: "date-order", schemaType: "object",
      validate: (args, value, ctx) => true | { field?, message }[], async?, plane? },
  ],
  formats: [{ name: "slug", validate: /regex/ | (v)=>boolean, plane? }],
});

// attach by name on a schema
slug: SchemaType.Refine(SchemaType.String(), "non-empty")
```

- `plane?: "server" | "client"` (undefined = both). Async object validators are server-only.
- `ValidatorCtx = { plane, getNode, RED }` — lets a validator resolve a referenced node, etc.
- Namespacing: every validator/format is namespaced by the **declaring node type** →
  `<type>:<name>`, so two installed packages can't collide in the shared ajv. (Author
  writes the bare name; the framework adds the prefix.) Alternative considered:
  package-name prefix (build injects the package name) — rejected because the package
  name isn't available at the `defineSchema` seam, but revisitable.

## How loading worked

**Server (explicit, per-node):** the node def carries `validators`
(`defineIONode({ …, validators })` → `static validators`). At registration,
`registerServerValidators(RED, NodeClass)` reads `NodeClass.validators` and calls
`RED.validator.registerValidators(type, mod, serverCtx)`. Schema markers are
prefixed at the validate sites.

**Client (implicit, build-discovered):** the editor only gets the schema as JSON
(functions can't serialize). So:
- the inliner serializes the server node's schema (markers namespaced) into the
  editor bundle (`_schemas[type]`), and
- emits `import defs from "src/shared/validators"; registerValidators("<type>", defs)`
  for each validator-bearing node — the predicate **functions ride this code import**.
- `defineNode`/`registerType` then validate the form via `validateNode(this, schema)`
  using the client ajv singleton the inliner populated.

## The asymmetry that made us pause

| | server | client |
|---|---|---|
| where validators are declared | on the node def (`validators:`) | nowhere — build-discovered |
| what it reads | the node's **actual** `validators` object | a boolean + the fixed file `src/shared/validators.ts` |

The client never uses the node's own `validators` value — it assumes every node's
`validators` *is* the default export of `src/shared/validators.ts` (an unenforced
convention). Break the convention → server validates, client silently doesn't.

## Two registration mechanisms we tried

1. **Dispatch keyword (built first):** one ajv keyword `x-nrg-validators` whose
   value is `{ "<type>:<name>": args }`; it looks each name up in a live `Map` and
   runs it. Pros: late-registration works (reads the Map at validate-time),
   single install, dedupe-free. Cons: indirection; not "native".
2. **Native ajv keywords (decided second, partially built):** each validator is its
   own ajv keyword `<type>:<name>` (symmetric with formats, which are already native
   ajv formats). `Refine` keeps writing the `x-nrg-validators` carrier as *authoring
   sugar*; the marker-prefixer **hoists** it into top-level native keywords and
   deletes the carrier before ajv sees the schema. Verified ajv accepts colon
   keyword names. Cons: loses the live-registry guarantee (must register before
   compile — true in practice).

## The open question we stopped on (`defineNode` symmetry)

User point: the client `defineNode` is optional and can override server props /
add client-only props. For symmetry, it should be able to carry **schemas and
validators** too:
- schemas already override via `registerType`'s `{ ...(_schemas[type]), ...definition }` spread.
- validators would need `registerType` to call `registerValidators(type, definition.validators)`.
Decision was: keep build auto-discovery AND let `defineNode.validators` add/override.
Not finished.

## Why we paused

The client/server loading asymmetry + the convention-vs-explicit tension +
the registration-mechanism churn felt like it needed a cleaner top-level model
before committing. Revisit: should validators be **package-level** (one
registration per package, package-name namespace) instead of per-node? That
removes the asymmetry and the per-node duplication.

## What was reverted

All `defineValidators` code: `src/core/shared/schemas/{validators,markers}.ts`,
`SchemaType.Refine`, the `x-nrg-validators` schema-option, `Validator.registerValidators`
+ keyword machinery, server/client `registerValidators`, the inliner discovery,
the component-test validators channel, and all related tests/docs/fixtures. Kept:
NodeRef unification, `src/core/shared` decoupling, the `src/core/shared` boundary lint.
The full implementation is recoverable from git history of this working tree if needed.
