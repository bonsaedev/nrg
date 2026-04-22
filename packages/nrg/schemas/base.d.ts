declare const NodeConfigSchema: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TString;
    type: import("@sinclair/typebox").TString;
    name: import("@sinclair/typebox").TString;
    z: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
}>;
declare const ConfigNodeConfigSchema: import("@sinclair/typebox").TObject<{
    _users: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TString>;
    id: import("@sinclair/typebox").TString;
    type: import("@sinclair/typebox").TString;
    name: import("@sinclair/typebox").TString;
    z: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
}>;
declare const IONodeConfigSchema: import("@sinclair/typebox").TObject<{
    wires: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TString>>;
    x: import("@sinclair/typebox").TNumber;
    y: import("@sinclair/typebox").TNumber;
    g: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    id: import("@sinclair/typebox").TString;
    type: import("@sinclair/typebox").TString;
    name: import("@sinclair/typebox").TString;
    z: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
}>;
declare const TypedInputSchema: import("@sinclair/typebox").TObject<{
    value: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNumber, import("@sinclair/typebox").TBoolean, import("@sinclair/typebox").TNull]>;
    type: import("@sinclair/typebox").TUnion<import("@sinclair/typebox").TLiteral<"msg" | "flow" | "global" | "str" | "num" | "bool" | "json" | "bin" | "re" | "jsonata" | "date" | "env" | "node" | "cred">[]>;
}>;
export { ConfigNodeConfigSchema, IONodeConfigSchema, NodeConfigSchema, TypedInputSchema, };
