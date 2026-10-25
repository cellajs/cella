import type { JSONSchemaDraft2020_12, OpenAPIV3_1 } from '@hey-api/spec-types';

/** JSON Schema 2020-12 with OpenAPI v3.1 extensions, re-exported as a stable alias for the parser. */
export type OpenApiSchema = JSONSchemaDraft2020_12.Document;

export type OpenApiParameter = OpenAPIV3_1.ParameterObject;

export type OpenApiRequestBody = OpenAPIV3_1.RequestBodyObject;

export type OpenApiResponseObject = OpenAPIV3_1.ResponseObject;

export type OpenApiReferenceObject = OpenAPIV3_1.ReferenceObject;

export type OpenApiSpec = OpenAPIV3_1.Document;

export type OpenApiOperation = OpenAPIV3_1.OperationObject;

/** Tag object plus this spec's extensions: `x-kind` and `x-parent` carry the OpenAPI 3.2 tag fields in a 3.1 document. */
export type OpenApiTag = OpenAPIV3_1.TagObject & {
  'x-kind'?: string;
  'x-parent'?: string;
  /** For schema-kind tags: marks the fallback bucket when a schema has no `x-tags`. */
  'x-default'?: boolean;
};
