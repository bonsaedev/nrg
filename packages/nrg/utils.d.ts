import type { TObject } from "@sinclair/typebox";
declare function getDefaultsFromSchema(schema: TObject): Record<string, {
    type?: string;
    required: boolean;
    value: any;
}>;
declare function getCredentialsFromSchema(schema: TObject): Record<string, {
    type: string;
    required: boolean;
    value: any;
}>;
export { getDefaultsFromSchema, getCredentialsFromSchema };
