import type { Options, ErrorObject, ErrorsTextOptions, AnySchemaObject, ValidateFunction, KeywordDefinition } from "ajv";
interface ValidationResult<T = unknown> {
    valid: boolean;
    data?: T;
    errors?: ErrorObject[];
    errorMessage?: string;
}
interface ValidatorOptions extends Options {
    customKeywords?: string[] | KeywordDefinition[];
    customFormats?: Record<string, RegExp | ((data: string) => boolean)>;
}
interface DetailedError {
    field: string;
    message: string;
    keyword: string;
    params: Record<string, unknown>;
    schemaPath: string;
}
interface ValidateOption {
    cacheKey?: string;
    throwOnError?: boolean;
}
declare class Validator {
    private readonly ajv;
    constructor(options?: ValidatorOptions);
    /**
     * Add custom keywords to the validator
     */
    private addCustomKeywords;
    /**
     * Add custom formats to the validator
     */
    private addCustomFormats;
    /**
     * Create a validator function with caching
     * @param schema - JSON Schema to validate against
     * @param cacheKey - Optional cache key for reusing validators
     */
    createValidator(schema: AnySchemaObject, cacheKey?: string): ValidateFunction;
    /**
     * Validate data against a schema and return a structured result
     */
    validate<T = unknown>(data: unknown, schema: AnySchemaObject, options?: ValidateOption): ValidationResult<T>;
    /**
     * Format errors into a human-readable string
     */
    formatErrors(errors?: ErrorObject[] | null, options?: ErrorsTextOptions): string;
    /**
     * Get detailed error information
     */
    getDetailedErrors(errors?: ErrorObject[] | null): DetailedError[];
    /**
     * Add a schema to the validator for reference
     */
    addSchema(schema: AnySchemaObject, key?: string): this;
    /**
     * Remove a schema from the validator
     */
    removeSchema(key: string): this;
}
/**
 * Custom error class for validation errors
 */
declare class ValidationError extends Error {
    readonly errors: ErrorObject[];
    constructor(message: string, errors: ErrorObject[]);
}
declare const validator: Validator;
export { Validator, ValidationError, validator };
export type { ValidationResult, ValidatorOptions, ValidateOption, DetailedError, };
