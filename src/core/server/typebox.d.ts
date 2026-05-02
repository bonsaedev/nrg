import type { NrgFormOptions } from "./schemas/types";

declare module "@sinclair/typebox" {
  interface SchemaOptions {
    exportable?: boolean;
    "x-nrg-node-type"?: string;
    "x-nrg-form"?: NrgFormOptions;
  }
}
