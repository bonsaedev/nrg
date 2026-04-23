import type {
  Options,
  ErrorObject,
  ErrorsTextOptions,
  AnySchemaObject,
  ValidateFunction,
  KeywordDefinition,
} from "ajv";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import addErrors from "ajv-errors";

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

class Validator {
  private readonly ajv: Ajv;

  public constructor(options?: ValidatorOptions) {
    const { customKeywords, customFormats, ...ajvOptions } = options || {};

    this.ajv = new Ajv({
      allErrors: true,
      code: {
        source: false,
      },
      coerceTypes: true,
      removeAdditional: false,
      strict: false,
      strictSchema: false,
      useDefaults: true,
      validateFormats: true,
      // NOTE: typebox handles validation via typescript
      // NOTE: if true, types that are not serializable JSON, like Function, would not work
      validateSchema: false,
      verbose: true,
      ...ajvOptions,
    });

    addFormats(this.ajv);
    addErrors(this.ajv);

    this.addCustomKeywords(customKeywords || []);
    this.addCustomFormats(customFormats || {});
  }

  /**
   * Add custom keywords to the validator
   */
  private addCustomKeywords(keywords?: string[] | KeywordDefinition[]): void {
    if (!keywords) return;
    keywords.forEach((keyword) => {
      this.ajv.addKeyword(keyword);
    });
  }

  /**
   * Add custom formats to the validator
   */
  private addCustomFormats(
    formats?: Record<string, RegExp | ((data: string) => boolean)>,
  ): void {
    if (!formats) return;

    Object.entries(formats).forEach(([name, validator]) => {
      if (validator instanceof RegExp) {
        this.ajv.addFormat(name, validator);
      } else {
        this.ajv.addFormat(name, { validate: validator });
      }
    });
  }

  /**
   * Create a validator function with caching
   * @param schema - JSON Schema to validate against
   * @param cacheKey - Optional cache key for reusing validators
   */
  public createValidator(
    schema: AnySchemaObject,
    cacheKey?: string,
  ): ValidateFunction {
    if (cacheKey && !schema.$id) {
      schema.$id = cacheKey;
    }

    if (schema.$id) {
      const cached = this.ajv.getSchema(schema.$id);
      if (cached) return cached;
    }

    const validator = this.ajv.compile(schema);

    return validator;
  }

  /**
   * Validate data against a schema and return a structured result
   */
  public validate<T = unknown>(
    data: unknown,
    schema: AnySchemaObject,
    options?: ValidateOption,
  ): ValidationResult<T> {
    const validator = this.createValidator(schema, options?.cacheKey);
    const valid = validator(data);

    if (!valid) {
      const errorMessage = this.formatErrors(validator.errors);

      if (options?.throwOnError) {
        throw new ValidationError(errorMessage, validator.errors || []);
      }

      return {
        valid: false,
        errors: validator.errors || undefined,
        errorMessage,
      };
    }

    return {
      valid: true,
      data: data as T,
    };
  }

  /**
   * Format errors into a human-readable string
   */
  public formatErrors(
    errors?: ErrorObject[] | null,
    options?: ErrorsTextOptions,
  ): string {
    if (!errors || errors.length === 0) {
      return "No errors";
    }

    return this.ajv.errorsText(errors, {
      separator: "; ",
      dataVar: "data",
      ...options,
    });
  }

  /**
   * Get detailed error information
   */
  public getDetailedErrors(errors?: ErrorObject[] | null): DetailedError[] {
    if (!errors || errors.length === 0) return [];

    return errors.map((error) => ({
      field: error.instancePath || "/",
      message: error.message || "Validation failed",
      keyword: error.keyword,
      params: error.params,
      schemaPath: error.schemaPath,
    }));
  }

  /**
   * Add a schema to the validator for reference
   */
  public addSchema(schema: AnySchemaObject, key?: string): this {
    this.ajv.addSchema(schema, key);
    return this;
  }

  /**
   * Remove a schema from the validator
   */
  public removeSchema(key: string): this {
    this.ajv.removeSchema(key);
    return this;
  }
}

/**
 * Custom error class for validation errors
 */
class ValidationError extends Error {
  constructor(
    message: string,
    public readonly errors: ErrorObject[],
  ) {
    super(message);
    this.name = "ValidationError";
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

const validator = new Validator();

export { Validator, ValidationError, validator };
export type {
  ValidationResult,
  ValidatorOptions,
  ValidateOption,
  DetailedError,
};
