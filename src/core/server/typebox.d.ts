// This import makes the file a module, which is required for
// TypeScript module augmentation (declare module) to work correctly.
// Without it, the file is treated as a global script and the
// augmentation silently fails.
import type { NrgSchemaExtensions } from "./schema-options";

declare module "@sinclair/typebox" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface SchemaOptions extends NrgSchemaExtensions {}
}
