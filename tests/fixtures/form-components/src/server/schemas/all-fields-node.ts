import { defineSchema, SchemaType } from "@bonsae/nrg/server";
import TestConfig from "../nodes/test-config";

const ConfigsSchema = defineSchema(
  {
    name: SchemaType.String({ default: "", minLength: 1 }),
    count: SchemaType.Integer({ default: 0, minimum: 1, maximum: 100 }),
    rate: SchemaType.Number({ default: 1.5, minimum: 0.1, maximum: 10 }),
    enabled: SchemaType.Boolean({
      default: true,
      "x-nrg-form": { toggle: true },
    } as any),
    active: SchemaType.Boolean({ default: false }),
    color: SchemaType.Union(
      [
        SchemaType.Literal("red"),
        SchemaType.Literal("green"),
        SchemaType.Literal("blue"),
      ],
      { default: "red" },
    ),
    target: SchemaType.TypedInput({
      default: { value: "payload", type: "msg" },
    }),
    source: SchemaType.TypedInput({
      default: { value: "", type: "str" },
      "x-nrg-form": { typedInputTypes: ["str", "num", "bool"] },
    } as any),
    tags: SchemaType.Array(
      SchemaType.Unsafe<string>({
        type: "string",
        enum: ["frontend", "backend", "devops"],
      }),
      { default: [] },
    ),
    recipients: SchemaType.Array(SchemaType.String(), { default: [] }),
    template: SchemaType.String({
      default: "<p>Hello</p>",
      "x-nrg-form": { editorLanguage: "html" },
    } as any),
    server: SchemaType.NodeRef(TestConfig),
  },
  { $id: "all-fields-node:configs" },
);

const CredentialsSchema = defineSchema(
  {
    apiKey: SchemaType.String({ default: "", format: "password" }),
    token: SchemaType.String({ default: "" }),
  },
  { $id: "all-fields-node:credentials" },
);

export { ConfigsSchema, CredentialsSchema };
