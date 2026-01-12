/**
 * OpenAPI Parser Helpers
 *
 * Pure functions for schema resolution, file generation, and categorization.
 * All functions can be tested in isolation.
 */

export type { SchemaTag } from './categorize';
// Categorization
export { getSchemaTag } from './categorize';

// File generators
export {
  generateIndexFile,
  generateInfoFile,
  generateOperationHash,
  generateOperationsFile,
  generateSchemasFile,
  generateTagDetailsFile,
  generateTagsFile,
} from './file-generators';
// Schema resolution
export { mergeAllOfSchemas, resolveRef, resolveSchema, resolveSchemaProperty } from './schema-resolvers';
// Types
export type { OpenApiParameter, OpenApiRequestBody, OpenApiSchema, OpenApiSpec } from './types';
