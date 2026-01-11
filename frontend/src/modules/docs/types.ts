/**
 * Centralized types for OpenAPI documentation module.
 * These types are used by the openapi-parser plugin and the generated files.
 * Prefixed with "Gen" to indicate they are generated from OpenAPI spec for docs.
 */

/**
 * Operation summary with minimal data for table/sidebar rendering
 */
export interface GenOperationSummary {
  id: string;
  hash: string;
  method: string;
  path: string;
  tags: string[];
  summary: string;
  description: string;
  deprecated: boolean;
  hasParams: boolean;
  hasRequestBody: boolean;
  /** x-guard specification extension - guard middleware */
  xGuard?: string[];
  /** x-rate-limiter specification extension - rate limiting rules */
  xRateLimiter?: string[];
}

/**
 * Tag summary with operation count
 */
export interface GenTagSummary {
  name: string;
  description?: string;
  count: number;
}

/**
 * OpenAPI info summary
 */
export interface GenInfoSummary {
  title: string;
  version: string;
  description: string;
  openapiVersion: string;
}

/**
 * Schema property with inline required field.
 * Represents a single property in a schema object.
 */
export interface GenSchemaProperty {
  /** Property type (string, number, boolean, object, array, or array for nullable like ['string', 'null']) */
  type: string | string[];
  /** Property description from OpenAPI spec */
  description?: string;
  /** Whether this property is required (inline, not in separate array) */
  required: boolean;
  /** Format constraint (e.g., 'email', 'date-time') */
  format?: string;
  /** Enum values if this is an enum type (can include null for nullable enums) */
  enum?: (string | number | boolean | null)[];
  /** Minimum value for numbers */
  minimum?: number;
  /** Maximum value for numbers */
  maximum?: number;
  /** Minimum length for strings/arrays */
  minLength?: number;
  /** Maximum length for strings/arrays */
  maxLength?: number;
  /** Minimum items for arrays */
  minItems?: number;
  /** Maximum items for arrays */
  maxItems?: number;
  /** Nested properties for object types */
  properties?: Record<string, GenSchemaProperty>;
  /** Items schema for array types */
  items?: GenSchemaProperty;
  /** Reference path if this was dereferenced (e.g., '#/components/schemas/User') */
  ref?: string;
  /** Description from the referenced schema */
  refDescription?: string;
  /** anyOf schemas (for union types) */
  anyOf?: GenSchemaProperty[];
  /** oneOf schemas (for discriminated unions) */
  oneOf?: GenSchemaProperty[];
  /** allOf schemas (for composition/inheritance) */
  allOf?: GenSchemaProperty[];
}

/**
 * Top-level schema representation for response bodies.
 * Includes reference metadata when dereferenced from a $ref.
 */
export interface GenSchema {
  /** Schema type (object, array, string, etc.) */
  type: string | string[];
  /** Original reference path if dereferenced */
  ref?: string;
  /** Description from the referenced schema or inline */
  refDescription?: string;
  /** Properties for object schemas */
  properties?: Record<string, GenSchemaProperty>;
  /** Items schema for array types */
  items?: GenSchemaProperty;
  /** Enum values if this is an enum type (can include null for nullable enums) */
  enum?: (string | number | boolean | null)[];
  /** anyOf schemas */
  anyOf?: GenSchema[];
  /** oneOf schemas */
  oneOf?: GenSchema[];
  /** allOf schemas */
  allOf?: GenSchema[];
}

/**
 * Response summary for operation details
 */
export interface GenResponseSummary {
  status: number;
  description: string;
  name?: string;
  ref?: string;
  /** Resolved response schema (dereferenced with ref metadata preserved) */
  schema?: GenSchema;
}

/**
 * Detailed operation info (for lazy loading per tag)
 */
export interface GenOperationDetail {
  operationId: string;
  responses: GenResponseSummary[];
}
