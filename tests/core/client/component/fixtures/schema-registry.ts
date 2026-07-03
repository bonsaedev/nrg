import { defineSchema, SchemaType } from "@/core/shared/schemas";

// A minimal node registry (the shape of `defineModule({ nodes })`) used to
// exercise the schemas globalSetup: each node carries real TypeBox schemas that
// serializeRegistry() serializes to plain JSON for the browser tests.
class FixtureNode {
  static type = "fixture-node";
  static configSchema = defineSchema(
    {
      name: SchemaType.String({ minLength: 1 }),
    },
    { $id: "schema-registry:1" },
  );
  static credentialsSchema = defineSchema(
    {
      token: SchemaType.String({ minLength: 1 }),
    },
    { $id: "schema-registry:2" },
  );
}

export default { nodes: [FixtureNode] };
