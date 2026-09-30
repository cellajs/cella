/**
 * Types for the docs JSON that the openapi-parser plugin writes into `sdk/gen/docs.gen` and the
 * frontend docs module fetches at runtime. The "Gen" prefix marks data generated from the OpenAPI spec.
 */

/** Metadata for one extension value, such as a specific limiter or guard. */
export interface GenExtensionValueMetadata {
  name?: string;
  description: string;
}

/** Custom OpenAPI extension, provided by the backend via info.x-extensions. */
export interface GenExtensionDefinition {
  /** OpenAPI extension key, e.g., 'x-guard' */
  key: string;
  /** Identifier for frontend property names, e.g., 'xGuard' */
  id: string;
  description: string;
  kind: 'middleware' | 'metadata';
  values?: Record<string, GenExtensionValueMetadata>;
}

/** Minimal operation data for table and sidebar rendering. */
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

export interface GenTagSummary {
  name: string;
  description?: string;
  count: number;
  kind?: string;
}

export interface GenInfoSummary {
  title: string;
  version: string;
  description: string;
  openapiVersion: string;
  /** Operations emitted to the docs (excludes hidden and service-disabled). */
  documentedOperationCount: number;
  /** Operations dropped from the docs by a hidden-kind tag; still present in openapi.json and the SDK. */
  hiddenOperationCount: number;
  extensions: GenExtensionDefinition[];
}

/**
 * One resolved schema node: a response body, a request section, a component schema, or any nested
 * property. `required` and `contentType` are present only where they apply.
 */
export interface GenSchema {
  /** Schema type (object, array, string, etc.), or a list for nullable types like ['string', 'null']. Omitted when anyOf/oneOf is present. */
  type?: string | readonly string[];
  description?: string;
  /** Inline required flag on properties and request bodies. Omitted for top-level schemas and array items. */
  required?: boolean;
  /** Content type of a response or request body (e.g., 'application/json') */
  contentType?: string;
  /** Format constraint (e.g., 'email', 'date-time', 'uuid') */
  format?: string;
  /** Enum values if this is an enum type (can include null for nullable enums) */
  enum?: readonly (string | number | boolean | null)[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  properties?: Record<string, GenSchema>;
  /** Value schema for record/map types, from OpenAPI additionalProperties */
  additionalProperties?: GenSchema;
  /** Item type for array types, unwrapped from items.type */
  itemType?: string | readonly string[];
  /** Items schema, set only for complex nested objects/arrays */
  items?: GenSchema;
  /** Reference path if this was dereferenced (e.g., '#/components/schemas/User') */
  ref?: string;
  /** Description from the referenced schema */
  refDescription?: string;
  /** Base schema reference when merged from allOf */
  extendsRef?: string;
  anyOf?: GenSchema[];
  oneOf?: GenSchema[];
  // Examples belong at the GenComponentSchema level only, not inside nested schemas.
}

export interface GenResponseSummary {
  status: number;
  description: string;
  name?: string;
  ref?: string;
  /** Content type of the response (e.g., 'application/json') */
  contentType?: string;
  /** Resolved response schema. Omitted for error responses, which resolve via name from schemas.gen.json */
  schema?: GenSchema;
  /** Example response value */
  example?: unknown;
}

export interface GenRequest {
  /** Path parameters, always required */
  path?: GenSchema;
  /** Query parameters, each with its own required flag */
  query?: GenSchema;
  /** Request body, with its content type and required flag */
  body?: GenSchema;
  /** Example request body value */
  example?: unknown;
}

/** Detailed operation info, loaded lazily per tag. */
export interface GenOperationDetail {
  operationId: string;
  responses: GenResponseSummary[];
  request?: GenRequest;
}

/** Schema tag: a backend-registered tag with `kind: 'schema'`, used for navigation and filtering. */
export interface GenSchemaTagSummary {
  /** Tag name identifier (e.g. 'base', 'data', 'errors') */
  name: string;
  /** What schemas this tag contains */
  description: string;
  /** Number of schemas with this tag */
  count: number;
}

/** A schema from components.schemas, for the schemas list page. */
export interface GenComponentSchema {
  /** Key in components.schemas */
  name: string;
  /** Full $ref path (e.g., '#/components/schemas/UserBase') */
  ref: string;
  description?: string;
  /** Schema type (object, array, string, etc.). Omitted when anyOf/oneOf is present. */
  type?: string | readonly string[];
  schema: GenSchema;
  /** Base schema reference when this schema extends another via allOf */
  extendsRef?: string;
  /** Backend-registered `kind: 'schema'` tag name, used for categorization */
  schemaTag: string;
  /** Tags grouped by their kind (e.g., { module: ['pages'], owner: ['cella'], schema: ['data'] }). */
  tagsByKind: Record<string, string[]>;
  /** operationIds of operations that use this schema */
  usedBy?: string[];
  /** Example value from OpenAPI spec */
  example?: unknown;
}
