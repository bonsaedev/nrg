import { defineSchema, SchemaType } from "@bonsae/nrg/schema";

// Mirrors the README Quick Start greeting node — a few typed config fields and
// one named output — so the docs' generated-form screenshot stays reproducible
// (captured by greeting.screenshot.test.ts).
const ConfigsSchema = defineSchema(
  {
    greeting: SchemaType.String({
      default: "Hello",
      description: "The greeting word placed before the name.",
      "x-nrg-form": { icon: "comment" },
    }),
    style: SchemaType.Union(
      [
        SchemaType.Literal("plain"),
        SchemaType.Literal("excited"),
        SchemaType.Literal("friendly"),
      ],
      {
        default: "plain",
        description: "Tone of the greeting.",
        "x-nrg-form": { icon: "paint-brush" },
      },
    ),
    repeat: SchemaType.Number({
      default: 1,
      description: "How many times to repeat the greeting.",
      "x-nrg-form": { icon: "repeat" },
    }),
    note: SchemaType.Optional(
      SchemaType.String({
        default: "",
        description: "Optional note shown under the node.",
        "x-nrg-form": { icon: "pencil" },
      }),
    ),
  },
  { $id: "greeting:configs" },
);

export { ConfigsSchema };
