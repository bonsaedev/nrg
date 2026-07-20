# Conditional Validation

Require or constrain a field **only when another field has a certain value** —
e.g. a REST endpoint's URL is required only when the type is `rest`. This uses
JSON Schema's `if`/`then`/`else` (via `allOf`), evaluated by the same validator
the runtime uses. It's an advanced capability; a first node rarely needs it.


NRG uses [AJV](https://ajv.js.org/) for schema validation, which supports JSON Schema's `if`/`then` conditional keywords. This lets you create dependent validation rules — where a field's constraints change based on another field's value. Validation errors are shown inline in the auto-generated form.

TypeBox natively supports `if`, `then`, `else`, and `allOf` — pass them in the `defineSchema` options object (the same options where you may optionally set a stable `$id`). For a single condition, use `if`/`then` directly. For multiple conditions, use `allOf` with an array of `if`/`then` objects.

You can also use [ajv-errors](https://github.com/ajv-validator/ajv-errors) `errorMessage` to provide custom, user-friendly error messages instead of the default AJV output.

#### Single condition

```typescript
import { defineSchema, SchemaType } from "@bonsae/nrg/schema";

const ConfigsSchema = defineSchema(
  {
    authType: SchemaType.String({
      default: "none",
      enum: ["none", "bearer"],
    }),
    token: SchemaType.String({ default: "", format: "password" }),
  },
  {
    $id: "my-node:configs",
    if: SchemaType.Object({ authType: SchemaType.Literal("bearer") }),
    then: SchemaType.Object({ token: SchemaType.String({ minLength: 1 }) }),
    errorMessage: {
      properties: {
        token: "Token is required for bearer auth",
      },
    },
  },
);
```

#### Multiple conditions

Use `allOf` to combine multiple independent `if`/`then` rules:

```typescript
import { defineSchema, SchemaType } from "@bonsae/nrg/schema";

const ConfigsSchema = defineSchema(
  {
    method: SchemaType.String({
      default: "GET",
      enum: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    }),
    url: SchemaType.String({ default: "", minLength: 1 }),
    body: SchemaType.String({ default: "" }),
    authType: SchemaType.String({
      default: "none",
      enum: ["none", "basic", "bearer"],
    }),
    username: SchemaType.String({ default: "" }),
    password: SchemaType.String({ default: "", format: "password" }),
    token: SchemaType.String({ default: "", format: "password" }),
    retries: SchemaType.Number({ default: 0, minimum: 0, maximum: 10 }),
    retryDelay: SchemaType.Number({ default: 1000, minimum: 100 }),
  },
  {
    $id: "http-request:configs",
    allOf: [
      // If method is POST/PUT/PATCH, body must not be empty
      {
        if: SchemaType.Object({
          method: SchemaType.String({ enum: ["POST", "PUT", "PATCH"] }),
        }),
        then: SchemaType.Object({
          body: SchemaType.String({ minLength: 1 }),
        }),
        errorMessage: {
          properties: {
            body: "Body is required for ${/method} requests",
          },
        },
      },
      // If authType is "basic", username and password are required
      {
        if: SchemaType.Object({
          authType: SchemaType.Literal("basic"),
        }),
        then: SchemaType.Object({
          username: SchemaType.String({ minLength: 1 }),
          password: SchemaType.String({ minLength: 1 }),
        }),
        errorMessage: {
          properties: {
            username: "Username is required for basic auth",
            password: "Password is required for basic auth",
          },
        },
      },
      // If authType is "bearer", token is required
      {
        if: SchemaType.Object({
          authType: SchemaType.Literal("bearer"),
        }),
        then: SchemaType.Object({
          token: SchemaType.String({ minLength: 1 }),
        }),
        errorMessage: {
          properties: {
            token: "Token is required for bearer auth",
          },
        },
      },
      // If retries > 0, retryDelay must be at least 100
      {
        if: SchemaType.Object({
          retries: SchemaType.Number({ exclusiveMinimum: 0 }),
        }),
        then: SchemaType.Object({
          retryDelay: SchemaType.Number({ minimum: 100 }),
        }),
        errorMessage: {
          properties: {
            retryDelay: "Retry delay is required when retries > 0",
          },
        },
      },
    ],
  },
);

export { ConfigsSchema };
```

#### How it works

- **`if`** — matches when the specified properties meet the condition (e.g., method is POST). Use `SchemaType.Object()` to define the condition schema
- **`then`** — applies additional constraints when the `if` matches. Use `SchemaType.Object()` to define the constraint schema
- **`else`** — applies constraints when the `if` does **not** match (optional)
- **`allOf`** — allows multiple independent conditions on the same schema
- **`errorMessage`** — custom error text shown in the form (from [ajv-errors](https://github.com/ajv-validator/ajv-errors)). You can interpolate values using JSON Pointer syntax like `${/method}`

::: tip Custom error messages
Without `errorMessage`, AJV shows generic messages like "must NOT have fewer than 1 characters". Use `errorMessage.properties` to replace these with context-specific messages that help users understand what to fix.
:::

::: warning Good to know
- **TypeScript types are not affected** — `if`/`then` conditions are enforced at runtime by AJV. `Infer<typeof Schema>` reflects the full shape of the schema with all fields present. This is expected — conditional requirements are a runtime concern, and your code should handle all fields regardless.
- **All fields are always rendered** — the auto-generated form displays every property in the schema. Conditional rules control when validation errors appear, not field visibility. For dynamic show/hide behavior, use a [custom form component](./editor-form#custom-form-component) — it only takes a few lines of Vue.
- **Need more advanced validation?** — JSON Schema covers most validation patterns (`if`/`then`, `pattern`, `minLength`, `minimum`, `enum`, etc.). For anything beyond that (async checks, complex cross-field logic), a custom form component gives you full control — you can combine schema-driven validation with your own computed validation errors.
:::
