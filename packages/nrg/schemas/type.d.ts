import type { TObject, TProperties, SchemaOptions, ObjectOptions } from "@sinclair/typebox";
import type { TNodeRef, TTypedInput } from "./types";
declare function NodeRef<T extends new (...args: any[]) => any>(nodeClass: T, options?: SchemaOptions): TNodeRef<InstanceType<T>>;
declare function TypedInput(options?: SchemaOptions): TTypedInput;
declare const Type: import("@sinclair/typebox").JavaScriptTypeBuilder & {
    NodeRef: typeof NodeRef;
    TypedInput: typeof TypedInput;
};
declare function defineSchema<T extends TProperties>(properties: T, options?: ObjectOptions): TObject<T>;
export { Type, defineSchema };
