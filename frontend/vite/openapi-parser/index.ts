/**
 * OpenAPI Parser Plugin for API Documentation
 *
 * Main entry point - re-exports the plugin and helpers.
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
export type { ParsedOpenApiSpec } from './parse-spec';

// Spec parsing
export { parseOpenApiSpec } from './parse-spec';
// Plugin exports
export { default, defaultConfig, defineConfig } from './plugin';

// Schema resolution
export { mergeAllOfSchemas, resolveRef, resolveSchema, resolveSchemaProperty } from './schema-resolvers';
// Types
export type { OpenApiParameter, OpenApiRequestBody, OpenApiSchema, OpenApiSpec } from './types';
