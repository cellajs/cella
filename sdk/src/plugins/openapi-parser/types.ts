/**
 * Type aliases for OpenAPI schema structures, backed by @hey-api/spec-types.
 * Used by schema resolution and parsing functions.
 *
 * Re-exported as aliases to maintain stable imports across the parser.
 * Non-standard spec fields (e.g., tag.kind) are handled via extension types.
 */

import type { JSONSchemaDraft2020_12, OpenAPIV3_1 } from '@hey-api/spec-types';

/** OpenAPI schema (JSON Schema 2020-12 with OpenAPI v3.1 extensions) */
export type OpenApiSchema = JSONSchemaDraft2020_12.Document;

/** OpenAPI parameter */
export type OpenApiParameter = OpenAPIV3_1.ParameterObject;

/** OpenAPI request body */
export type OpenApiRequestBody = OpenAPIV3_1.RequestBodyObject;

/** OpenAPI response object */
export type OpenApiResponseObject = OpenAPIV3_1.ResponseObject;

/** OpenAPI reference object */
export type OpenApiReferenceObject = OpenAPIV3_1.ReferenceObject;

/** OpenAPI spec document */
export type OpenApiSpec = OpenAPIV3_1.Document;

/** Extended tag type for non-standard fields in our spec (kind, parent) */
export type OpenApiTag = OpenAPIV3_1.TagObject & {
  kind?: string;
  parent?: string;
  /** For schema-kind tags: marks the fallback bucket when a schema has no `x-tags`. */
  'x-default'?: boolean;
};
