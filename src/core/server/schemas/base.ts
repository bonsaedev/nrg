// Server-only base schemas: the node config-shape schemas the node base classes
// resolve their config types from, and the built-in port message schemas. These
// are framework-internal — they are NOT part of the public @bonsae/nrg/schema
// kit. They are authored with `SchemaType` (the shared builder) rather than raw
// TypeBox so the whole server tree stays free of `@sinclair/typebox`; the day
// the builder swaps TypeBox for another engine, only ./factories changes.
import { SchemaType } from "../../shared/schemas";

const NodeConfigSchema = SchemaType.Object({
  id: SchemaType.String(),
  type: SchemaType.String(),
  name: SchemaType.String(),
  z: SchemaType.Optional(SchemaType.String()),
});

const ConfigNodeConfigSchema = SchemaType.Object({
  ...NodeConfigSchema.properties,
  _users: SchemaType.Array(SchemaType.String()),
});

const IONodeConfigSchema = SchemaType.Object({
  ...NodeConfigSchema.properties,
  wires: SchemaType.Array(
    SchemaType.Array(SchemaType.String(), { default: [] }),
    {
      default: [[]],
    },
  ),
  x: SchemaType.Number(),
  y: SchemaType.Number(),
  g: SchemaType.Optional(SchemaType.String()),
});

// --- Built-in port schemas ---
// These define the guaranteed properties on built-in port messages.
// Error and complete messages also include the original input message properties.

const NodeSourceSchema = SchemaType.Object({
  id: SchemaType.String(),
  type: SchemaType.String(),
  name: SchemaType.String(),
});

const ErrorPortOutputSchema = SchemaType.Object({
  error: SchemaType.Object({
    // `name` is emitted at both error-port sites (auto-emit from a thrown error
    // and `this.error(msg, m)`), Catch-node compatible — see IONode.
    name: SchemaType.String(),
    message: SchemaType.String(),
    source: NodeSourceSchema,
  }),
});

const CompletePortOutputSchema = SchemaType.Object({
  complete: SchemaType.Object({
    source: NodeSourceSchema,
  }),
});

const StatusPortOutputSchema = SchemaType.Object({
  status: SchemaType.Union([
    SchemaType.Object({
      fill: SchemaType.Optional(
        SchemaType.Union([
          SchemaType.Literal("red"),
          SchemaType.Literal("green"),
          SchemaType.Literal("yellow"),
          SchemaType.Literal("blue"),
          SchemaType.Literal("grey"),
          SchemaType.Literal("gray"),
        ]),
      ),
      shape: SchemaType.Optional(
        SchemaType.Union([
          SchemaType.Literal("ring"),
          SchemaType.Literal("dot"),
        ]),
      ),
      text: SchemaType.Optional(SchemaType.String()),
    }),
    SchemaType.String(),
  ]),
  source: NodeSourceSchema,
});

export {
  CompletePortOutputSchema,
  ConfigNodeConfigSchema,
  ErrorPortOutputSchema,
  IONodeConfigSchema,
  NodeConfigSchema,
  NodeSourceSchema,
  StatusPortOutputSchema,
};
