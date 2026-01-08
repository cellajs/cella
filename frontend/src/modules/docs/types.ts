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
  hasAuth: boolean;
  hasParams: boolean;
  hasRequestBody: boolean;
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
 * Response summary for operation details
 */
export interface GenResponseSummary {
  status: number;
  description: string;
  name?: string;
  ref?: string;
}

/**
 * Detailed operation info (for lazy loading per tag)
 */
export interface GenOperationDetail {
  operationId: string;
  responses: GenResponseSummary[];
}
