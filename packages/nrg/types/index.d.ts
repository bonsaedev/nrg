import type { SchemaOptions } from "@sinclair/typebox";
interface NodeSchemaOptions extends SchemaOptions {
    nodeType?: string;
    default?: any;
    format?: string;
}
export { NodeSchemaOptions };
