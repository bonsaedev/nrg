import type { SchemaOptions } from "@sinclair/typebox";

interface NodeSchemaOptions extends SchemaOptions {
  "node-type"?: string;
  default?: any;
  format?: string;
}

export { NodeSchemaOptions };
