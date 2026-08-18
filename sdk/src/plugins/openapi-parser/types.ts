import type { JSONSchemaDraft2020_12, OpenAPIV3_1 } from '@hey-api/spec-types';

/** JSON Schema 2020-12 with OpenAPI v3.1 extensions, re-exported as a stable alias for the parser. */
export type OpenApiSchema = JSONSchemaDraft2020_12.Document;

export type OpenApiParameter = OpenAPIV3_1.ParameterObject;

export type OpenApiRequestBody = OpenAPIV3_1.RequestBodyObject;

export type OpenApiResponseObject = OpenAPIV3_1.ResponseObject;

export type OpenApiReferenceObject = OpenAPIV3_1.ReferenceObject;

export type OpenApiSpec = OpenAPIV3_1.Document;

/** Tag object plus the non-standard fields this spec adds. */
export type OpenApiTag = OpenAPIV3_1.TagObject & {
  kind?: string;
  parent?: string;
  /** For schema-kind tags: marks the fallback bucket when a schema has no `x-tags`. */
  'x-default'?: boolean;
};
