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
import { NrgError } from "./errors";

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
  throwOnError?: boolean;
  /**
   * When `false`, validate against a NON-coercing AJV: the data is treated as
   * read-only — no type coercion, no default injection (a pure predicate). Use
   * for message/form validation so a validated object is never silently
   * rewritten. Default `true` (config-plane behavior: coerce + inject defaults so
   * `this.config.<field>` reads as its typed value via the proxy).
   */
  mutate?: boolean;
}

class Validator {
  // Coercing instance (coerceTypes + useDefaults): mutates the validated object.
  // Used for the config plane, where `this.config.<field>` must read as its typed
  // value (the proxy returns whatever coercion left on the raw config).
  private readonly ajv: Ajv;
  // Non-mutating instance (no coercion, no defaults): a pure predicate. Used for
  // message/form validation so a validated msg/form is never silently rewritten.
  private readonly pureAjv: Ajv;
  // `$id` → the schema object (and owner label) that first claimed it, recorded
  // by reserveSchemaId() at node registration. AJV caches compiled validators by
  // `$id`, so two *different* schemas sharing one `$id` is a silent bug — this
  // registry makes the collision fail loudly.
  private readonly registeredSchemaIds = new Map<
    string,
    { schema: object; owner: string }
  >();

  public constructor(options?: ValidatorOptions) {
    const { customKeywords, customFormats, ...ajvOptions } = options || {};
    this.ajv = this.buildAjv(ajvOptions, true, customKeywords, customFormats);
    this.pureAjv = this.buildAjv(
      ajvOptions,
      false,
      customKeywords,
      customFormats,
    );
  }

  private buildAjv(
    ajvOptions: Options,
    mutate: boolean,
    customKeywords?: string[] | KeywordDefinition[],
    customFormats?: Record<string, RegExp | ((data: string) => boolean)>,
  ): Ajv {
    const ajv = new Ajv({
      allErrors: true,
      code: {
        source: false,
      },
      // coerceTypes + useDefaults both WRITE into the validated object; gate them
      // on `mutate` so the pure instance leaves data untouched.
      coerceTypes: mutate,
      removeAdditional: false,
      strict: false,
      strictSchema: false,
      useDefaults: mutate,
      validateFormats: true,
      // NOTE: typebox handles validation via typescript
      // NOTE: if true, types that are not serializable JSON, like Function, would not work
      validateSchema: false,
      verbose: true,
      ...ajvOptions,
    });

    addFormats(ajv);
    addErrors(ajv);

    this.addCustomKeywords(ajv, customKeywords || []);
    this.addCustomFormats(ajv, customFormats || {});

    return ajv;
  }

  /**
   * Add custom keywords to the given ajv instance
   */
  private addCustomKeywords(
    ajv: Ajv,
    keywords?: string[] | KeywordDefinition[],
  ): void {
    if (!keywords) return;
    keywords.forEach((keyword) => {
      ajv.addKeyword(keyword);
    });
  }

  /**
   * Add custom formats to the given ajv instance
   */
  private addCustomFormats(
    ajv: Ajv,
    formats?: Record<string, RegExp | ((data: string) => boolean)>,
  ): void {
    if (!formats) return;

    Object.entries(formats).forEach(([name, validator]) => {
      if (validator instanceof RegExp) {
        ajv.addFormat(name, validator);
      } else {
        ajv.addFormat(name, { validate: validator });
      }
    });
  }

  // Object-keyed compile cache for `$id`-less schemas. AJV caches by `$id`; a
  // schema without one (an ad-hoc `SchemaType.Object`, or a flow-author override
  // a node memoizes and revalidates every message) would otherwise recompile —
  // and accumulate — on every `compile()`. Keyed by the schema OBJECT so a reused
  // instance compiles once; a WeakMap so the entry is collected with the schema.
  // One per AJV (coercing vs pure) since each keeps its own compiled forms.
  private readonly pureInlineCache = new WeakMap<
    AnySchemaObject,
    ValidateFunction
  >();
  private readonly mutateInlineCache = new WeakMap<
    AnySchemaObject,
    ValidateFunction
  >();

  /**
   * Compile (and cache) a validator for a schema. Schemas WITH an `$id` use AJV's
   * own registry (`defineSchema` requires a unique `$id`, so `getSchema` returns
   * the previously compiled validator). Schemas WITHOUT one — an ad-hoc
   * `SchemaType.Object` or a flow-author override — are cached by object
   * reference here, so a caller that reuses the same schema instance compiles it
   * only once (no unbounded recompile/leak). We never write `$id` (no mutation of
   * the caller's schema).
   *
   * @param schema - JSON Schema to validate against
   * @param mutate - `true` (default) uses the coercing instance; `false` uses the
   *   non-mutating (pure-predicate) instance. Each AJV keeps its own registry.
   */
  public createValidator(
    schema: AnySchemaObject,
    mutate = true,
  ): ValidateFunction {
    const ajv = mutate ? this.ajv : this.pureAjv;
    if (schema.$id) {
      const cached = ajv.getSchema(schema.$id);
      if (cached) return cached as ValidateFunction;
      return ajv.compile(schema);
    }
    const cache = mutate ? this.mutateInlineCache : this.pureInlineCache;
    const cached = cache.get(schema);
    if (cached) return cached;
    const compiled = ajv.compile(schema);
    cache.set(schema, compiled);
    return compiled;
  }

  /**
   * Reserve a schema's `$id` at registration so a collision fails loudly.
   * {@link createValidator} caches compiled validators by `$id`, so if two
   * *different* schemas share one `$id` the second would silently validate
   * against the first. Reserving the same schema object again (a re-deploy, or
   * one schema reused across roles) is idempotent. A schema without `$id` is a
   * no-op here. Convention: `"<node-type>:<role>"`.
   *
   * @param schema - the schema being registered (its `$id` is the key)
   * @param owner - human-readable origin (e.g. `"my-node.config"`) for the error
   * @throws NrgError when `$id` is already held by a different schema object.
   */
  public reserveSchemaId(schema: AnySchemaObject, owner: string): void {
    const id = schema.$id;
    if (!id) return;
    const existing = this.registeredSchemaIds.get(id);
    if (existing && existing.schema !== schema) {
      throw new NrgError(
        `Duplicate schema $id "${id}": declared by both ${existing.owner} and ` +
          `${owner}. $id is the AJV compile-cache key and must be unique — a ` +
          `collision makes one schema validate against another. Convention: ` +
          `"<node-type>:<role>".`,
      );
    }
    this.registeredSchemaIds.set(id, { schema, owner });
  }

  /**
   * Validate data against a schema and return a structured result
   */
  public validate<T = unknown>(
    data: unknown,
    schema: AnySchemaObject,
    options?: ValidateOption,
  ): ValidationResult<T> {
    const validator = this.createValidator(schema, options?.mutate ?? true);
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
   * Add a schema to both validator instances for cross-schema `$ref` reference.
   */
  public addSchema(schema: AnySchemaObject, key?: string): this {
    this.ajv.addSchema(schema, key);
    this.pureAjv.addSchema(schema, key);
    return this;
  }

  /**
   * Remove a schema from both validator instances.
   */
  public removeSchema(key: string): this {
    this.ajv.removeSchema(key);
    this.pureAjv.removeSchema(key);
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

export { Validator, ValidationError };
export type {
  ValidationResult,
  ValidatorOptions,
  ValidateOption,
  DetailedError,
};
