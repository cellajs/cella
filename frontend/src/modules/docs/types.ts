/**
 * Centralized types for the OpenAPI docs module, shared with the openapi-parser plugin and
 * generated files. The "Gen" prefix marks types generated from the OpenAPI spec.
 */

/**
 * Metadata for an individual extension value (e.g., a specific limiter or guard)
 */
export interface GenExtensionValueMetadata {
  name?: string;
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
  /** Description of the extension's purpose */
  description: string;
  /** Whether this extension is middleware or metadata */
  kind: 'middleware' | 'metadata';
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
  /** Tags grouped by their kind (e.g., { module: ['tasks'], owner: ['app'] }) */
  tagsByKind: Record<string, string[]>;
  /** Entity type derived from tag (e.g., 'user', 'organization'). Only set for entity-related operations. */
  entityType?: string;
}

/**
 * Tag summary with operation count
 */
export interface GenTagSummary {
  name: string;
  description?: string;
  count: number;
  kind?: string;
}

/**
 * OpenAPI info summary
 */
export interface GenInfoSummary {
  title: string;
  version: string;
  description: string;
  openapiVersion: string;
  /** Operations emitted to the docs (excludes hidden and service-disabled). */
  documentedOperationCount: number;
  /** Operations dropped from the docs by a hidden-kind tag; still present in openapi.json and the SDK. */
  hiddenOperationCount: number;
  /** Custom OpenAPI extensions defined by the backend */
  extensions: GenExtensionDefinition[];
}

/**
 * Schema property with inline required field.
 * Represents a single property in a schema object.
 */
export interface GenSchemaProperty {
  /** Property type (string, number, boolean, object, array, or array for nullable like ['string', 'null']). Omitted when anyOf/oneOf is present. */
  type?: string | readonly string[];
  /** Property description from OpenAPI spec */
  description?: string;
  /** Whether this property is required (inline, not in separate array). Omitted for array items. */
  required?: boolean;
  /** Format constraint (e.g., 'email', 'date-time') */
  format?: string;
  /** Enum values if this is an enum type (can include null for nullable enums) */
  enum?: readonly (string | number | boolean | null)[];
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
  /** Value schema for record/map types (from OpenAPI additionalProperties) */
  additionalProperties?: GenSchemaProperty;
  /** Item type for array types (unwrapped from items.type) */
  itemType?: string | readonly string[];
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
  // Example is intentionally omitted here.
  // Examples belong at the GenComponentSchema level only, not inside nested properties.
}

/**
 * Top-level schema representation for response bodies.
 * Includes reference metadata when dereferenced from a $ref.
 */
export interface GenSchema {
  /** Schema type (object, array, string, etc.). Omitted when anyOf/oneOf is present. */
  type?: string | readonly string[];
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
  /** Value schema for record/map types (from OpenAPI additionalProperties) */
  additionalProperties?: GenSchemaProperty;
  /** Item type for array types (unwrapped from items.type) */
  itemType?: string | readonly string[];
  /** Items schema for array types (only for complex nested objects/arrays) */
  items?: GenSchemaProperty;
  /** Enum values if this is an enum type (can include null for nullable enums) */
  enum?: readonly (string | number | boolean | null)[];
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
  // Example is intentionally omitted here: examples belong at the GenComponentSchema level, not
  // inside schema.schema, to avoid duplicating example data in the generated output.
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
 * Request section for path, query, or body.
 * These are organizational containers, not actual schema types.
 */
export interface GenRequestSection {
  /** Whether this section is required (only meaningful for body) */
  required?: boolean;
  /** Content type for body (e.g., 'application/json') */
  contentType?: string;
  /** Schema type (for array/object body types) */
  type?: string | readonly string[];
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
  /** Value schema for record/map types (from OpenAPI additionalProperties) */
  additionalProperties?: GenSchemaProperty;
  /** Items schema for array body types */
  items?: GenSchemaProperty;
  /** Item type for array body types */
  itemType?: string | readonly string[];
  /** Enum values for body */
  enum?: readonly (string | number | boolean | null)[];
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
  /** Example value for request body from OpenAPI spec */
  example?: unknown;
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
 * Schema tag summary. Schema tags are configured backend-side as registered tags with
 * `kind: 'schema'`, used for schema-tag navigation and filtering.
 */
export interface GenSchemaTagSummary {
  /** Tag name identifier (e.g. 'base', 'data', 'errors') */
  name: string;
  /** Description of what schemas this tag contains */
  description: string;
  /** Number of schemas with this tag */
  count: number;
}

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
  type?: string | readonly string[];
  /** Resolved schema with full property details */
  schema: GenSchema;
  /** Whether this schema extends another via allOf */
  extendsRef?: string;
  /** Schema tag for categorization: a backend-registered `kind: 'schema'` tag name. */
  schemaTag: string;
  /** Tags grouped by their kind (e.g., { module: ['pages'], owner: ['cella'], schema: ['data'] }). */
  tagsByKind: Record<string, string[]>;
  /** References to this schema from operations (operationIds that use it) */
  usedBy?: string[];
  /** Example value from OpenAPI spec */
  example?: unknown;
}
