// Augments TypeBox's `SchemaOptions` with NRG's custom JSON-Schema vocabulary so
// `SchemaType.String({ "x-nrg-form": … })` etc. type-check. It lives on the
// shared plane (next to the vocabulary it pulls in) because the schema builder
// that consumes these options — `SchemaType`/`defineSchema` in ./schemas — is
// shared, and the server tree must never name `@sinclair/typebox` directly.
//
// The import below makes the file a module, which is required for TypeScript
// module augmentation (`declare module`) to work — without it the file is a
// global script and the augmentation silently fails.
import type { JsonSchemaObjectExtensions } from "./schema-options";

declare module "@sinclair/typebox" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface SchemaOptions extends JsonSchemaObjectExtensions {}
}
