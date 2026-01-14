/**
 * Type definitions for OpenAPI schema structures.
 * Used by schema resolution and parsing functions.
 */

export type OpenApiSchema = {
  type?: string | string[];
  description?: string;
  format?: string;
  enum?: (string | number | boolean)[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  properties?: Record<string, OpenApiSchema>;
  required?: string[];
  items?: OpenApiSchema;
  $ref?: string;
  anyOf?: OpenApiSchema[];
  oneOf?: OpenApiSchema[];
  allOf?: OpenApiSchema[];
  /** Example value for documentation */
  example?: unknown;
};

export type OpenApiParameter = {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required?: boolean;
  description?: string;
  schema?: OpenApiSchema;
  $ref?: string;
};

export type OpenApiRequestBody = {
  required?: boolean;
  content?: Record<string, { schema?: OpenApiSchema }>;
  $ref?: string;
};

export type OpenApiSpec = {
  openapi?: string;
  info?: {
    title?: string;
    version?: string;
    description?: string;
    'x-extensions'?: Array<{
      key: string;
      id: string;
      translationKey: string;
      description: string;
    }>;
  };
  tags?: { name: string; description?: string }[];
  components?: {
    schemas?: Record<string, OpenApiSchema>;
    responses?: Record<string, { description?: string; content?: Record<string, { schema?: OpenApiSchema }> }>;
  };
  paths?: Record<string, Record<string, unknown>>;
};
