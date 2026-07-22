# The Editor Form

How each config, credential, or setting field renders in the editor form — the field-type catalog plus the `x-nrg-form` extensions, `TypedInput`, `NodeRef`, conditional validation, and type inference. To replace the generated form with a bespoke Vue component, see [Custom Vue Forms](./editor-form).

## Defining the schema

Schemas define the shape of your node's configuration. They're used for runtime validation and to auto-generate editor defaults.

Create `src/shared/schemas/my-node.ts`:

```typescript
import { defineSchema, SchemaType } from "@bonsae/nrg/schema";

export const ConfigsSchema = defineSchema(
  {
    name: SchemaType.String({ default: "" }),
    prefix: SchemaType.String({ default: "hello" }),
    threshold: SchemaType.Number({ default: 10 }),
    enabled: SchemaType.Boolean({ default: true }),
  },
  { $id: "my-node:configs" }
);

export const CredentialsSchema = defineSchema(
  {
    apiKey: SchemaType.String({ default: "" }),
    secret: SchemaType.String({ default: "", format: "password" }),
  },
  { $id: "my-node:credentials" }
);

export const SettingsSchema = defineSchema(
  {
    apiEndpoint: SchemaType.String({ default: "https://api.example.com" }),
    maxRetries: SchemaType.Number({ default: 3 }),
  },
  { $id: "my-node:settings" }
);
```

### Schema Types

`SchemaType` extends TypeBox's `Type` with Node-RED-specific types. The auto-generated form (`<NodeRedJsonSchemaForm>`) renders each schema type as a specific input widget:

| Schema | Renders As |
| --- | --- |
| `SchemaType.String()` | Text input |
| `SchemaType.String({ format: "password" })` | Password input |
| `SchemaType.String({ "x-nrg-form": { editorLanguage: "..." } })` | Code editor with syntax highlighting |
| `SchemaType.Number()` | Number input (`minimum`/`maximum`/`multipleOf` → `min`/`max`/`step`) |
| `SchemaType.Integer()` | Number input that steps by 1 |
| `SchemaType.Boolean()` | Checkbox |
| `SchemaType.Optional(...)` | Marks a property as optional |
| `SchemaType.Array(SchemaType.String())` | Textarea (one entry per line) |
| `SchemaType.Array(SchemaType.String({ enum: [...] }))` | Multi-select dropdown |
| `SchemaType.Union([SchemaType.Literal(...)])` | Single-select dropdown |
| `SchemaType.Object(...)` | JSON textarea (edited as JSON, stored as a parsed object) |
| `SchemaType.TypedInput<T>()` | Node-RED TypedInput (value + type pair, resolves to `T`) |
| `SchemaType.NodeRef<NodeClass>("node-type")` | Config node selector dropdown |

### Customizing Form Rendering with `x-nrg-form`

The `x-nrg-form` property is a JSON Schema extension that controls how a field is rendered in the auto-generated editor form. You can pass it as an option to any `SchemaType` method:

```typescript
SchemaType.String({
  default: "",
  "x-nrg-form": {
    icon: "globe",
    editorLanguage: "json",
  },
})
```

| Property | Type | Description |
| --- | --- | --- |
| `icon` | `string` | Font Awesome icon name displayed in the field label (e.g., `"globe"`, `"key"`, `"server"`). The `fa-` prefix is optional — `"globe"` and `"fa-globe"` both work. |
| `editorLanguage` | `string` | Renders the field as a code editor with syntax highlighting. Supports `json`, `javascript`, `html`, `css`, `yaml`, `sql`, `python`, `markdown`, and [many more](https://microsoft.github.io/monaco-editor/). |
| `typedInputTypes` | `string[]` | Restricts the allowed types in a `TypedInput` widget. Defaults to all types: `msg`, `flow`, `global`, `str`, `num`, `bool`, `json`, `bin`, `re`, `jsonata`, `date`, `env`, `node`, `cred`. |
| `toggle` | `boolean` | Renders a boolean field as a toggle switch instead of a checkbox. Only applies to `SchemaType.Boolean()` fields. |

TypeScript autocomplete is available for all `x-nrg-form` properties — no imports needed.

::: tip Field help text
A field's **label** and a **help note** shown under its input both come from the label file, not the schema — so they stay translatable per locale. Add a `description` to the field's `configs`/`credentials` entry:

```json
"configs": {
  "timeout": {
    "label": "Timeout (ms)",
    "description": "Abort the request after this many milliseconds."
  }
}
```

The description renders as a muted note beneath the input (above any validation error) and in the field's Description column in the auto-generated help docs. See [Locales & Help Docs](./locales).
:::

**Example — adding icons to labels:**

```typescript
import type RemoteServer from "../../server/nodes/remote-server";

export const ConfigsSchema = defineSchema(
  {
    name: SchemaType.String({ default: "", "x-nrg-form": { icon: "tag" } }),
    url: SchemaType.String({ default: "", "x-nrg-form": { icon: "globe" } }),
    timeout: SchemaType.Number({ default: 5000, "x-nrg-form": { icon: "clock-o" } }),
    enabled: SchemaType.Boolean({ default: true, "x-nrg-form": { icon: "check", toggle: true } }),
    server: SchemaType.NodeRef<RemoteServer>("remote-server", { "x-nrg-form": { icon: "server" } }),
    endpoint: SchemaType.TypedInput({
      "x-nrg-form": { icon: "plug", typedInputTypes: ["str", "msg", "flow"] },
    }),
    template: SchemaType.String({
      default: "",
      "x-nrg-form": { icon: "code", editorLanguage: "html" },
    }),
  },
  { $id: "my-node:configs" }
);
```

### Text Input

A plain string renders as a text input:

```typescript
export const ConfigsSchema = defineSchema(
  {
    name: SchemaType.String({ default: "" }),
  },
  { $id: "my-node:configs" }
);
```

### Password Input

Use `format: "password"` to mask the input:

```typescript
export const ConfigsSchema = defineSchema(
  {
    secret: SchemaType.String({ default: "", format: "password" }),
  },
  { $id: "my-node:configs" }
);
```

### Number Input

```typescript
export const ConfigsSchema = defineSchema(
  {
    retries: SchemaType.Number({ default: 3 }),
  },
  { $id: "my-node:configs" }
);
```

The JSON-Schema numeric constraints `minimum`, `maximum`, and `multipleOf` flow
through to the generated `<input>` as its `min`, `max`, and `step`:

```typescript
export const ConfigsSchema = defineSchema(
  {
    retries: SchemaType.Number({ default: 3, minimum: 0, maximum: 10, multipleOf: 1 }),
  },
  { $id: "my-node:configs" }
);
```

An **integer** schema (`SchemaType.Integer({ ... })`) always steps by 1,
regardless of `multipleOf`.

### Checkbox

```typescript
export const ConfigsSchema = defineSchema(
  {
    enabled: SchemaType.Boolean({ default: true }),
  },
  { $id: "my-node:configs" }
);
```

### Toggle

Use `"x-nrg-form": { toggle: true }` to render a boolean field as a toggle switch instead of a checkbox:

```typescript
export const ConfigsSchema = defineSchema(
  {
    followRedirects: SchemaType.Boolean({
      default: true,
      "x-nrg-form": { icon: "share", toggle: true },
    }),
  },
  { $id: "my-node:configs" }
);
```

In a custom form, use `<NodeRedToggle>`:

```vue
<template>
  <NodeRedToggle
    v-model="node.followRedirects"
    label="Follow Redirects"
    icon="share"
  />
</template>
```

### Select (Picklist)

Use `SchemaType.Union` with `SchemaType.Literal` values to create a single-select dropdown:

```typescript
export const ConfigsSchema = defineSchema(
  {
    method: SchemaType.Union(
      [
        SchemaType.Literal("GET"),
        SchemaType.Literal("POST"),
        SchemaType.Literal("PUT"),
        SchemaType.Literal("DELETE"),
      ],
      { default: "GET" }
    ),
  },
  { $id: "my-node:configs" }
);
```

In a custom form, use `<NodeRedSelectInput>`:

```vue
<template>
  <NodeRedSelectInput
    v-model="node.method"
    label="Method"
    :options="[
      { value: 'GET', label: 'GET' },
      { value: 'POST', label: 'POST' },
      { value: 'PUT', label: 'PUT' },
      { value: 'DELETE', label: 'DELETE' },
    ]"
  />
</template>
```

### Multi-Select (Multi-Picklist)

Use `SchemaType.Array` with items that have an `enum` to create a multi-select dropdown:

```typescript
export const ConfigsSchema = defineSchema(
  {
    methods: SchemaType.Array(
      SchemaType.String({ enum: ["GET", "POST", "PUT", "DELETE"] }),
      { default: ["GET"] }
    ),
  },
  { $id: "my-node:configs" }
);
```

In a custom form, set the `multiple` prop:

```vue
<template>
  <NodeRedSelectInput
    v-model="node.methods"
    label="Methods"
    :multiple="true"
    :options="[
      { value: 'GET', label: 'GET' },
      { value: 'POST', label: 'POST' },
      { value: 'PUT', label: 'PUT' },
      { value: 'DELETE', label: 'DELETE' },
    ]"
  />
</template>
```

### Textarea (Array of Strings)

A plain array of strings renders as a textarea where each line is an entry:

```typescript
export const ConfigsSchema = defineSchema(
  {
    allowedHosts: SchemaType.Array(SchemaType.String(), { default: [] }),
  },
  { $id: "my-node:configs" }
);
```

### Code Editor

Use `SchemaType.String` with `"x-nrg-form": { editorLanguage: "..." }` to render a code editor with syntax highlighting:

```typescript
export const ConfigsSchema = defineSchema(
  {
    template: SchemaType.String({
      default: "",
      "x-nrg-form": { editorLanguage: "html" },
    }),
    payload: SchemaType.String({
      default: "{}",
      "x-nrg-form": { editorLanguage: "json" },
    }),
  },
  { $id: "my-node:configs" }
);
```

In a custom form, use `<NodeRedEditorInput>`:

```vue
<template>
  <NodeRedEditorInput
    v-model="node.template"
    label="Template"
    language="html"
  />
</template>
```

Supported languages include `json`, `javascript`, `html`, `css`, `yaml`, `sql`, `python`, `markdown`, and many more.

### TypedInput

A `TypedInput` stores both a value and its type (e.g., `msg.payload`, a string literal, or a JSONata expression). You can specify the expected resolved type via the generic parameter:

```typescript
export const ConfigsSchema = defineSchema(
  {
    target: SchemaType.TypedInput<string>(),
  },
  { $id: "my-node:configs" }
);
```

By default, all types are available: `msg`, `flow`, `global`, `str`, `num`, `bool`, `json`, `bin`, `re`, `jsonata`, `date`, `env`, `node`, `cred`.

Restrict the allowed types using `"x-nrg-form": { typedInputTypes: [...] }`. The auto-generated form picks them up automatically:

```typescript
export const ConfigsSchema = defineSchema(
  {
    target: SchemaType.TypedInput<string>({
      "x-nrg-form": { typedInputTypes: ["str", "num", "msg"] },
    }),
  },
  { $id: "my-node:configs" }
);
```

In a custom form, pass the types via the `types` prop:

```vue
<template>
  <NodeRedTypedInput
    v-model="node.target"
    label="Target"
    :types="['str', 'num', 'msg']"
  />
</template>
```

The `v-model` binds the whole `{ value, type }` object; the component emits the updated object whenever the user changes the value or the type.

At runtime, `this.config.target` is a `TypedInput` instance with `.type`, `.value`, and `.resolve()`:

```typescript
override async input(msg: MyNodeInput) {
  const target = this.config.target;
  this.log(`Type: ${target.type}, Value: ${target.value}`);

  // resolve() evaluates the value using Node-RED's evaluateNodeProperty
  // Return type is inferred from SchemaType.TypedInput<T>()
  const resolved: string = await target.resolve(msg);
  this.log(`Resolved: ${resolved}`);
}
```

### NodeRef (Config Node Reference)

A `NodeRef` creates a typed reference to a config node. Pass the config node's
registered `type` string at runtime, and the config class as a **type-only**
generic:

```typescript
import type RemoteServer from "../../server/nodes/remote-server";

export const ConfigsSchema = defineSchema(
  {
    server: SchemaType.NodeRef<RemoteServer>("remote-server"),
  },
  { $id: "my-node:configs" }
);
```

The generic is erased at compile time, so the schema **never value-imports the
config class** — keep the import `import type` (as above). That keeps the schema
safe to evaluate in the editor/browser bundle, where server node classes don't
exist. At runtime, `this.config.server` still resolves to the referenced node
*instance* on the server, and to the node-id `string` on the client.

In a custom form, use `<NodeRedConfigInput>`:

```vue
<template>
  <NodeRedConfigInput
    v-model="node.server"
    label="Server"
    type="remote-server"
    :node="node"
    prop-name="server"
  />
</template>
```

Need a field to be required only when another field has a certain value? That's
**conditional validation** — see [Conditional Validation](./conditional-validation).

### Inferring the TypeScript Type

Use `Infer` to extract the TypeScript type from a schema:

```typescript
import type { Infer } from "@bonsae/nrg/server";

export type Config = Infer<typeof ConfigsSchema>;
export type Credentials = Infer<typeof CredentialsSchema>;
export type Settings = Infer<typeof SettingsSchema>;
```

#### One source of truth for input/output shapes {#infer-input-output}

`Infer` isn't just for config. Whenever a hand-written `Input`/`Output` type is a
plain-data shape that a schema could describe, you're maintaining the same shape
twice. Derive the type from the schema instead — the schema becomes the single
source of truth, and you get runtime validation for free.

Take a SOQL query node. It emits the query result on one output port, so authors
often hand-write the port's message type inline:

```typescript
// The port's message type spells out a shape a schema could describe just as well:
type SoqlOutputs = Outputs<{
  out: Port<{
    records: Record<string, unknown>[];
    totalSize: number;
    done: boolean;
  }>;
}>;
```

That type is compile-time only — it draws the port and type-checks wires, but the
framework never validates what you actually `send()`, and the editor has no
output shape to show. Describe the shape once as a schema and let the type fall
out of it:

```typescript
// src/shared/schemas/soql.ts
import { defineSchema, SchemaType } from "@bonsae/nrg/schema";

export const OutputSchema = defineSchema(
  {
    records: SchemaType.Array(
      SchemaType.Record(SchemaType.String(), SchemaType.Unknown()),
    ),
    totalSize: SchemaType.Number(),
    done: SchemaType.Boolean(),
  },
  { $id: "soql:output" },
);
```

```typescript
// src/server/nodes/soql.ts
import { IONode, type Infer, type Input, type Outputs, type Port } from "@bonsae/nrg/server";
import { OutputSchema } from "@/schemas/soql";

// Compose the inferred shape into a named output port — Infer types the port's
// message; Outputs<{ out: Port<…> }> is what declares the port itself.
type SoqlInput = Input<Port<{ query: string }>>;
type SoqlOutputs = Outputs<{ out: Port<Infer<typeof OutputSchema>> }>;

export default class Soql extends IONode<Config, any, SoqlInput, SoqlOutputs> {
  static override readonly type = "soql";
  static override readonly configSchema = ConfigsSchema;
  // The output port and its type come from the `SoqlOutputs` generic above.
  // ...
}
```

Deriving from the schema keeps one description in one place:

1. **No duplication** — change the shape in one place; the type follows, and the
   editor has an output shape to show.
2. **A schema to validate against** — the same shape can back per-port runtime
   data validation, which is a **config-schema framework control**
   (`SchemaType.OutputSchemas`), never a static on the class. See
   [Configuring validation in the editor](./schemas#editor-schema-overrides).

The `SoqlOutputs` generic is what draws the port and type-checks wires; runtime
data validation is optional and layered on separately. See
[Custom Vue Forms](./editor-form#the-editor-form) for exactly what surfaces each section.
