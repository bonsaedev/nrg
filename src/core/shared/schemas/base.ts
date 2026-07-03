import { TYPED_INPUT_TYPES } from "../constants";
// Use TypeBox's `Type` directly (not NRG's `SchemaType`) so this module does NOT
// import ./factories. `TypedInputSchema` needs only plain JSON-schema builders,
// and importing `SchemaType` would form a factories.ts ↔ base.ts cycle —
// factories.ts imports `TypedInputSchema` from here, so base.ts must not import
// back. The cycle is load-order-fragile: it crashed the root `@bonsae/nrg` entry
// bundle (`SchemaType` undefined when this module's top-level ran). This is the
// one base schema that is genuinely shared (the shared TypedInput factory
// consumes it); the node config-shape and port schemas are server-only and live
// in core/server/schemas/base.
import { Type as BaseType } from "@sinclair/typebox";

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

export { TypedInputSchema };
