import { TYPED_INPUT_TYPES } from "../../constants";
import { SchemaType } from "./type";

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

const TypedInputSchema = SchemaType.Object(
  {
    value: SchemaType.Union(
      [
        SchemaType.String(),
        SchemaType.Number(),
        SchemaType.Boolean(),
        SchemaType.Null(),
      ],
      {
        description: "The actual value entered or selected.",
        default: "",
      },
    ),
    type: SchemaType.Union(
      TYPED_INPUT_TYPES.map((type) => SchemaType.Literal(type)),
      {
        description:
          "The type of the value (string, number, message property, etc.)",
        default: "str",
      },
    ),
  },
  {
    description: "Represents a Node-RED TypedInput value and its type.",
    default: {
      type: "str",
      value: "",
    },
  },
);

// --- Built-in port schemas ---
// These match the message shapes constructed by IONode at runtime.

const NodeSourceSchema = SchemaType.Object({
  id: SchemaType.String(),
  type: SchemaType.String(),
  name: SchemaType.String(),
});

const ErrorPortSchema = SchemaType.Object({
  error: SchemaType.Object({
    message: SchemaType.String(),
    source: NodeSourceSchema,
  }),
});

const CompletePortSchema = SchemaType.Object({
  complete: SchemaType.Object({
    source: NodeSourceSchema,
  }),
});

const StatusPortSchema = SchemaType.Object({
  status: SchemaType.Object({
    fill: SchemaType.Optional(
      SchemaType.Union([
        SchemaType.Literal("red"),
        SchemaType.Literal("green"),
      ]),
    ),
    shape: SchemaType.Optional(
      SchemaType.Union([
        SchemaType.Literal("dot"),
        SchemaType.Literal("string"),
      ]),
    ),
    text: SchemaType.Optional(SchemaType.String()),
  }),
  source: NodeSourceSchema,
});

export {
  CompletePortSchema,
  ConfigNodeConfigSchema,
  ErrorPortSchema,
  IONodeConfigSchema,
  NodeConfigSchema,
  StatusPortSchema,
  TypedInputSchema,
};
