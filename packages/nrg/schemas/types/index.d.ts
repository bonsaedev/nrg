import type { Kind, TSchema, Static } from "@sinclair/typebox";
import type { TYPED_INPUT_TYPES } from "../../constants";
interface TNodeRef<T = any> extends TSchema {
    [Kind]: "NodeRef";
    static: T;
    type: "string";
    "node-type"?: string;
}
type ResolveNodeRefs<T> = T extends TNodeRef<infer N> ? N : T extends (...args: any[]) => any ? T : T extends Array<infer Item> ? ResolveNodeRefs<Item>[] : T extends object ? {
    [K in keyof T]: ResolveNodeRefs<T[K]>;
} : T;
type Infer<T extends TSchema> = ResolveNodeRefs<Static<T>>;
type TypedInputType = (typeof TYPED_INPUT_TYPES)[number];
interface TTypedInput extends TSchema {
    [Kind]: "TypedInput";
    static: {
        value: string | number | boolean | null;
        type: TypedInputType;
    };
}
declare module "@sinclair/typebox" {
    interface SchemaOptions {
        exportable?: boolean;
    }
}
export { Infer, ResolveNodeRefs, TNodeRef, TTypedInput };
export type { TSchema, TObject, TString, TNumber, TBoolean, TArray, TUnion, TIntersect, TLiteral, TEnum, TRecord, TTuple, TOptional, TNull, TInteger, TRef, TConst, TFunction, SchemaOptions, } from "@sinclair/typebox";
