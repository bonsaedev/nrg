# Schema Validation

NRG uses [TypeBox](https://github.com/sinclairzx81/typebox) schemas for runtime validation on both server and client. Schemas serve two purposes: they validate data at runtime with AJV, and they provide TypeScript type inference via `Infer`.

::: warning Future changes
In a future release, NRG plans to replace AJV with TypeBox's native validation and upgrade to [TypeBox v1](https://www.npmjs.com/package/typebox) (published as `typebox` on npm), which is ESM-only. This may introduce breaking changes to schema definitions and validation behavior.
:::

## Defining Schemas

Use `defineSchema` to create a schema with a required `$id`:

```typescript
import { defineSchema, SchemaType } from "@bonsae/nrg/server";

export const ConfigsSchema = defineSchema(
  {
    name: SchemaType.String({ default: "" }),
    retries: SchemaType.Number({ default: 3, minimum: 0, maximum: 10 }),
    verbose: SchemaType.Boolean({ default: false }),
    tags: SchemaType.Array(SchemaType.String(), { default: [] }),
    metadata: SchemaType.Optional(
      SchemaType.Object({
        version: SchemaType.String(),
      })
    ),
  },
  { $id: "my-node:configs" }
);
```

The `$id` is required and must be unique across all schemas. It's used as the AJV cache key.

## Type Inference

Extract the TypeScript type from any schema:

```typescript
import type { Infer } from "@bonsae/nrg/server";

type Config = Infer<typeof ConfigsSchema>;
// { name: string; retries: number; verbose: boolean; tags: string[]; metadata?: { version: string } }
```

## Config Schema

The `configSchema` static property validates node configuration when a node instance is created. Validation failures produce warnings (they don't prevent the node from starting):

```typescript
export default class MyNode extends IONode<Config> {
  static readonly configSchema: Schema = ConfigsSchema;
  // ...
}
```

Default values from the schema are used by the editor to initialize new node instances.

## Credentials Schema

Credentials are stored separately and encrypted by Node-RED. Define them with `credentialsSchema`:

```typescript
export const CredentialsSchema = defineSchema(
  {
    apiKey: SchemaType.String({ default: "" }),
    secret: SchemaType.String({ default: "" }),
  },
  { $id: "my-node:credentials" }
);
```

```typescript
export default class MyNode extends IONode<Config, Credentials> {
  static readonly configSchema: Schema = ConfigsSchema;
  static readonly credentialsSchema: Schema = CredentialsSchema;

  async input(msg: any) {
    const apiKey = this.credentials?.apiKey;
    // ...
  }
}
```

The build system automatically extracts credential field types (text/password) from the schema for the Node-RED editor.

## Input Schema

Validate incoming messages before they reach your `input()` handler:

```typescript
const InputSchema = defineSchema(
  {
    payload: SchemaType.String(),
    topic: SchemaType.Optional(SchemaType.String()),
  },
  { $id: "my-node:input" }
);

export default class MyNode extends IONode<Config> {
  static readonly inputSchema: Schema = InputSchema;
  static readonly validateInput = true;

  async input(msg: any) {
    // msg.payload is guaranteed to be a string here
  }
}
```

Set `validateInput = true` on the class to enable validation. Invalid messages throw an error.

## Output Schema

Validate outgoing messages when `this.send()` is called:

```typescript
const OutputSchema = defineSchema(
  {
    payload: SchemaType.Object({
      result: SchemaType.String(),
      timestamp: SchemaType.Number(),
    }),
  },
  { $id: "my-node:output" }
);

export default class MyNode extends IONode<Config> {
  static readonly outputsSchema: Schema = OutputSchema;
  static readonly validateOutput = true;

  async input(msg: any) {
    this.send({
      payload: { result: "ok", timestamp: Date.now() },
    });
  }
}
```

For nodes with multiple outputs, provide an array of schemas:

```typescript
export default class MyNode extends IONode<Config> {
  static readonly outputs = 2;
  static readonly outputsSchema: Schema[] = [SuccessSchema, ErrorSchema];
  static readonly validateOutput = true;

  async input(msg: any) {
    try {
      // Send to first output
      this.send([{ payload: "success" }, null]);
    } catch {
      // Send to second output
      this.send([null, { payload: "error" }]);
    }
  }
}
```

## Settings Schema

Define Node-RED runtime settings that your node reads from `settings.js`:

```typescript
const SettingsSchema = defineSchema(
  {
    apiEndpoint: SchemaType.String({ default: "https://api.example.com" }),
    maxConnections: SchemaType.Number({ default: 5 }),
  },
  { $id: "my-node:settings" }
);

export default class MyNode extends IONode<Config, any, any, any, Settings> {
  static readonly settingsSchema: Schema = SettingsSchema;

  async input(msg: any) {
    const endpoint = this.settings.apiEndpoint;
    // ...
  }
}
```

Settings are validated once when the node type is first registered. They're accessed via `this.settings` with full type safety.

Setting keys in `settings.js` are prefixed with the camelCase version of the node type. For a node with `type = "my-node"`, the settings key `apiEndpoint` maps to `myNodeApiEndpoint` in the Node-RED settings file.
