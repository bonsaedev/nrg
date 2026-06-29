import { TYPED_INPUT_TYPES } from "../constants";
// Use TypeBox's `Type` directly (not NRG's `SchemaType`) so this module does NOT
// import ./type. These base schemas need only plain JSON-schema builders, and the
// import would otherwise form a type.ts ↔ base.ts cycle — type.ts imports
// `TypedInputSchema` from here, so base.ts must not import back. The cycle is
// load-order-fragile: it crashed the root `@bonsae/nrg` entry bundle
// (`SchemaType` undefined when this module's top-level ran).
import { Type as BaseType } from "@sinclair/typebox";

const NodeConfigSchema = BaseType.Object({
  id: BaseType.String(),
  type: BaseType.String(),
  name: BaseType.String(),
  z: BaseType.Optional(BaseType.String()),
});

const ConfigNodeConfigSchema = BaseType.Object({
  ...NodeConfigSchema.properties,
  _users: BaseType.Array(BaseType.String()),
});

const IONodeConfigSchema = BaseType.Object({
  ...NodeConfigSchema.properties,
  wires: BaseType.Array(BaseType.Array(BaseType.String(), { default: [] }), {
    default: [[]],
  }),
  x: BaseType.Number(),
  y: BaseType.Number(),
  g: BaseType.Optional(BaseType.String()),
});

const TypedInputSchema = BaseType.Object(
  {
    value: BaseType.Union(
      [
        BaseType.String(),
        BaseType.Number(),
        BaseType.Boolean(),
        BaseType.Null(),
      ],
      {
        description: "The actual value entered or selected.",
        default: "",
      },
    ),
    type: BaseType.Union(
      TYPED_INPUT_TYPES.map((type) => BaseType.Literal(type)),
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
// These define the guaranteed properties on built-in port messages.
// Error and complete messages also include the original input message properties.

const NodeSourceSchema = BaseType.Object({
  id: BaseType.String(),
  type: BaseType.String(),
  name: BaseType.String(),
});

const ErrorPortSchema = BaseType.Object({
  error: BaseType.Object({
    message: BaseType.String(),
    source: NodeSourceSchema,
  }),
});

const CompletePortSchema = BaseType.Object({
  complete: BaseType.Object({
    source: NodeSourceSchema,
  }),
});

const StatusPortSchema = BaseType.Object({
  status: BaseType.Union([
    BaseType.Object({
      fill: BaseType.Optional(
        BaseType.Union([
          BaseType.Literal("red"),
          BaseType.Literal("green"),
          BaseType.Literal("yellow"),
          BaseType.Literal("blue"),
          BaseType.Literal("grey"),
          BaseType.Literal("gray"),
        ]),
      ),
      shape: BaseType.Optional(
        BaseType.Union([BaseType.Literal("ring"), BaseType.Literal("dot")]),
      ),
      text: BaseType.Optional(BaseType.String()),
    }),
    BaseType.String(),
  ]),
  source: NodeSourceSchema,
});

export {
  CompletePortSchema,
  ConfigNodeConfigSchema,
  ErrorPortSchema,
  IONodeConfigSchema,
  NodeConfigSchema,
  NodeSourceSchema,
  StatusPortSchema,
  TypedInputSchema,
};
