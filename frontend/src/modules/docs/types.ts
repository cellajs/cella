/**
 * Centralized types for OpenAPI documentation module.
 * These types are used by the openapi-parser plugin and the generated files.
 * Prefixed with "Gen" to indicate they are generated from OpenAPI spec for docs.
 */

/**
 * Metadata for an individual extension value (e.g., a specific limiter or guard)
 */
export interface GenExtensionValueMetadata {
  description: string;
}

/**
 * Definition for a custom OpenAPI extension.
 * Provided by backend via info.x-extensions.
 */
export interface GenExtensionDefinition {
  /** OpenAPI extension key, e.g., 'x-guard' */
  key: string;
  /** Identifier for frontend property names, e.g., 'xGuard' */
  id: string;
  /** Translation key for i18n support */
  translationKey: string;
  /** Description of the extension's purpose */
  description: string;
  /** Optional metadata for each value (e.g., each limiter's description) */
  values?: Record<string, GenExtensionValueMetadata>;
}

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
  /** Whether any response has a body (schema) */
  hasResponseBody: boolean;
  /** Whether any response has an example value */
  hasExample: boolean;
  /** Dynamic x-extensions keyed by camelCase name */
  extensions: Record<string, string[]>;
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
  /** Custom OpenAPI extensions defined by the backend */
  extensions: GenExtensionDefinition[];
}

/**
 * Schema property with inline required field.
 * Represents a single property in a schema object.
 */
export interface GenSchemaProperty {
  /** Property type (string, number, boolean, object, array, or array for nullable like ['string', 'null']). Omitted when anyOf/oneOf is present. */
  type?: string | string[];
  /** Property description from OpenAPI spec */
  description?: string;
  /** Whether this property is required (inline, not in separate array). Omitted for array items. */
  required?: boolean;
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
  /** Item type for array types (unwrapped from items.type) */
  itemType?: string | string[];
  /** Items schema for array types (only for complex nested objects/arrays) */
  items?: GenSchemaProperty;
  /** Reference path if this was dereferenced (e.g., '#/components/schemas/User') */
  ref?: string;
  /** Description from the referenced schema */
  refDescription?: string;
  /** Reference to base schema when merged from allOf (for inheritance tracking) */
  extendsRef?: string;
  /** anyOf schemas (for union types) */
  anyOf?: GenSchemaProperty[];
  /** oneOf schemas (for discriminated unions) */
  oneOf?: GenSchemaProperty[];
  // Note: example is intentionally NOT included here.
  // Examples belong at the GenComponentSchema level only, not inside nested properties.
}

/**
 * Top-level schema representation for response bodies.
 * Includes reference metadata when dereferenced from a $ref.
 */
export interface GenSchema {
  /** Schema type (object, array, string, etc.). Omitted when anyOf/oneOf is present. */
  type?: string | string[];
  /** Schema description from OpenAPI spec */
  description?: string;
  /** Original reference path if dereferenced */
  ref?: string;
  /** Description from the referenced schema or inline */
  refDescription?: string;
  /** Content type (e.g., 'application/json') */
  contentType?: string;
  /** Format constraint (e.g., 'email', 'date-time', 'uuid') */
  format?: string;
  /** Minimum value for numbers */
  minimum?: number;
  /** Maximum value for numbers */
  maximum?: number;
  /** Minimum length for strings */
  minLength?: number;
  /** Maximum length for strings */
  maxLength?: number;
  /** Properties for object schemas */
  properties?: Record<string, GenSchemaProperty>;
  /** Item type for array types (unwrapped from items.type) */
  itemType?: string | string[];
  /** Items schema for array types (only for complex nested objects/arrays) */
  items?: GenSchemaProperty;
  /** Enum values if this is an enum type (can include null for nullable enums) */
  enum?: (string | number | boolean | null)[];
  /** Minimum items for arrays */
  minItems?: number;
  /** Maximum items for arrays */
  maxItems?: number;
  /** Reference to base schema when merged from allOf (for inheritance tracking) */
  extendsRef?: string;
  /** anyOf schemas */
  anyOf?: GenSchema[];
  /** oneOf schemas */
  oneOf?: GenSchema[];
  // Note: example is intentionally NOT included here.
  // Examples belong at the GenComponentSchema level, not inside schema.schema.
  // This prevents duplication of example data in the generated output.
}

/**
 * Response summary for operation details
 */
export interface GenResponseSummary {
  status: number;
  description: string;
  name?: string;
  ref?: string;
  /** Content type of the response (e.g., 'application/json') */
  contentType?: string;
  /** Resolved response schema (dereferenced with ref metadata preserved). Omitted for error responses (resolved via name from schemas.gen.json) */
  schema?: GenSchema;
  /** Example response value from OpenAPI spec */
  example?: unknown;
}

/**
 * Parameter summary for path/query parameters
 */
export interface GenParameterSummary {
  /** Parameter name */
  name: string;
  /** Parameter location (path, query) */
  in: 'path' | 'query';
  /** Whether the parameter is required */
  required: boolean;
  /** Parameter description */
  description?: string;
  /** Parameter schema */
  schema?: GenSchemaProperty;
}

/**
 * Request body summary
 */
export interface GenRequestBodySummary {
  /** Whether the request body is required */
  required: boolean;
  /** Content type (e.g., 'application/json') */
  contentType: string;
  /** Request body schema */
  schema?: GenSchema;
}

/**
 * Request section for path, query, or body.
 * These are organizational containers, not actual schema types.
 */
export interface GenRequestSection {
  /** Whether this section is required (only meaningful for body) */
  required?: boolean;
  /** Content type for body (e.g., 'application/json') */
  contentType?: string;
  /** Schema type (for array/object body types) */
  type?: string | string[];
  /** Schema description from OpenAPI spec */
  description?: string;
  /** Format constraint (e.g., 'email', 'date-time', 'uuid') */
  format?: string;
  /** Minimum value for numbers */
  minimum?: number;
  /** Maximum value for numbers */
  maximum?: number;
  /** Minimum length for strings */
  minLength?: number;
  /** Maximum length for strings */
  maxLength?: number;
  /** Properties within the section */
  properties?: Record<string, GenSchemaProperty>;
  /** Items schema for array body types */
  items?: GenSchemaProperty;
  /** Item type for array body types */
  itemType?: string | string[];
  /** Enum values for body */
  enum?: (string | number | boolean | null)[];
  /** Minimum items for arrays */
  minItems?: number;
  /** Maximum items for arrays */
  maxItems?: number;
  /** Reference for body schema */
  ref?: string;
  /** Reference description for body schema */
  refDescription?: string;
  /** Extends reference for allOf merged body schema */
  extendsRef?: string;
  /** anyOf schemas for body */
  anyOf?: GenSchema[];
  /** oneOf schemas for body */
  oneOf?: GenSchema[];
}

/**
 * Combined request with path, query, and body sections
 */
export interface GenRequest {
  /** Path parameters (all always required by nature of URL) */
  path?: GenRequestSection;
  /** Query parameters (individual params have their own required status) */
  query?: GenRequestSection;
  /** Request body (section can be required/optional) */
  body?: GenRequestSection;
}

/**
 * Detailed operation info (for lazy loading per tag)
 */
export interface GenOperationDetail {
  operationId: string;
  responses: GenResponseSummary[];
  /** Combined request with path, query, and body sections */
  request?: GenRequest;
}

/**
 * Schema tag for categorizing schemas in the docs UI.
 * - base: Base schemas with fundamental entity fields (name contains 'Base')
 * - errors: Error response schemas (name contains 'Error')
 * - data: All other data schemas for API responses and requests
 */
export type SchemaTag = 'base' | 'data' | 'errors';

/**
 * Schema tag summary with description and count.
 * Used for schema tag navigation and filtering.
 */
export interface GenSchemaTagSummary {
  /** Tag name identifier */
  name: SchemaTag;
  /** Description of what schemas this tag contains */
  description: string;
  /** Number of schemas with this tag */
  count: number;
}

/**
 * Tag name type - represents API operation tag names.
 * This is a string type that allows for dynamic tag names from the OpenAPI spec.
 */
export type TagName = string;

/**
 * Component schema summary for schemas list page.
 * Represents a schema from components.schemas in the OpenAPI spec.
 */
export interface GenComponentSchema {
  /** Schema name (key in components.schemas) */
  name: string;
  /** Full $ref path (e.g., '#/components/schemas/UserBase') */
  ref: string;
  /** Schema description if available */
  description?: string;
  /** Schema type (object, array, string, etc.). Omitted when anyOf/oneOf is present. */
  type?: string | string[];
  /** Resolved schema with full property details */
  schema: GenSchema;
  /** Whether this schema extends another via allOf */
  extendsRef?: string;
  /** Schema tag for categorization (base, data, errors) */
  schemaTag: SchemaTag;
  /** References to this schema from operations (operationIds that use it) */
  usedBy?: string[];
  /** Example value from OpenAPI spec */
  example?: unknown;
}
