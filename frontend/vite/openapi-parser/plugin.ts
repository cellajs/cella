/**
 * OpenAPI Parser Plugin for API Documentation
 *
 * Transforms OpenAPI spec into lightweight operation summaries for docs UI.
 * Generates two arrays:
 * - operations: Minimal data for table rows and sidebar
 * - tags: Tag metadata with operation counts
 *
 * Secondary data (full descriptions, parameters, schemas) is accessed
 * on-demand from the full OpenAPI spec.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DefinePlugin } from '@hey-api/openapi-ts';
import { definePluginConfig } from '@hey-api/openapi-ts';
import type {
  GenComponentSchema,
  GenInfoSummary,
  GenOperationDetail,
  GenOperationSummary,
  GenRequest,
  GenResponseSummary,
  GenSchema,
  GenTagSummary,
} from '../../src/modules/docs/types';
import type { OpenApiParameter, OpenApiRequestBody, OpenApiSchema, OpenApiSpec } from './helpers';
import {
  generateIndexFile,
  generateInfoFile,
  generateOperationHash,
  generateOperationsFile,
  generateSchemasFile,
  generateTagDetailsFile,
  generateTagsFile,
  getSchemaTag,
  resolveSchema,
  resolveSchemaProperty,
} from './helpers';

/**
 * Configuration options for the openapi-parser plugin.
 */
type Config = {
  name: 'openapi-parser';
  output?: string;
};

type OpenApiParserPlugin = DefinePlugin<Config>;

/**
 * Handler function for the openapi-parser plugin
 */
const handler: OpenApiParserPlugin['Handler'] = ({ plugin }) => {
  const operations: GenOperationSummary[] = [];
  const tagMap = new Map<string, { description?: string; count: number }>();
  // Track detailed operation info per tag for lazy-loaded files
  const tagDetailsMap = new Map<string, GenOperationDetail[]>();

  // Get the raw OpenAPI spec to access original descriptions
  const spec = plugin.context.spec;

  // Get tag descriptions from the OpenAPI spec directly
  if (spec.tags) {
    for (const tag of spec.tags) {
      tagMap.set(tag.name, { description: tag.description, count: 0 });
    }
  }

  // Iterate through spec.paths directly to preserve order
  const validMethods = new Set(['get', 'post', 'put', 'delete', 'patch', 'options', 'head']);

  if (spec.paths) {
    for (const [path, pathItem] of Object.entries(spec.paths)) {
      if (!pathItem) continue;

      // Iterate in the order the methods appear in pathItem
      for (const [method, operation] of Object.entries(pathItem as Record<string, unknown>)) {
        if (!validMethods.has(method)) continue;

        const op = operation as {
          operationId?: string;
          description?: string;
          summary?: string;
          tags?: string[];
          deprecated?: boolean;
          security?: unknown[];
          parameters?: OpenApiParameter[];
          requestBody?: OpenApiRequestBody;
          responses?: Record<string, { description?: string; $ref?: string }>;
          'x-guard'?: string[];
          'x-rate-limiter'?: string[];
        };

        if (!op?.operationId) continue;

        const tags = op.tags ?? [];

        // Cast spec to OpenApiSpec for type safety with our resolver functions
        const typedSpec = spec as OpenApiSpec;

        // Helper to resolve $ref to component responses
        const componentResponses = (spec.components?.responses ?? {}) as Record<
          string,
          { description?: string; content?: Record<string, { schema?: OpenApiSchema }> }
        >;

        // Extract responses for operation details
        const responses: GenResponseSummary[] = [];
        if (op.responses) {
          for (const [statusCode, response] of Object.entries(op.responses)) {
            let description = response?.description ?? '';
            let name: string | undefined;
            let ref: string | undefined;
            let contentType: string | undefined;
            let schema: GenSchema | undefined;

            // Resolve $ref if present (e.g., "#/components/responses/BadRequestError")
            if (response?.$ref) {
              ref = response.$ref;
              name = response.$ref.split('/').pop();
              if (name && componentResponses[name]) {
                const componentResponse = componentResponses[name];
                description = componentResponse.description ?? '';
                // Get schema from component response (check all content types, prefer JSON)
                if (componentResponse.content) {
                  const contentTypes = Object.keys(componentResponse.content);
                  const jsonType = contentTypes.find((ct) => ct.includes('json'));
                  const selectedContentType = jsonType || contentTypes[0];
                  if (selectedContentType) {
                    contentType = selectedContentType;
                    const responseSchema = componentResponse.content[selectedContentType]?.schema;
                    if (responseSchema) {
                      schema = resolveSchema(responseSchema, typedSpec);
                    }
                  }
                }
              }
            }

            // Check for inline response content with schema
            const content = (response as { content?: Record<string, { schema?: OpenApiSchema }> })?.content;
            if (content) {
              const contentTypes = Object.keys(content);
              const jsonType = contentTypes.find((ct) => ct.includes('json'));
              const selectedContentType = jsonType || contentTypes[0];
              if (selectedContentType && content[selectedContentType]?.schema) {
                contentType = selectedContentType;
                const responseSchema = content[selectedContentType].schema;
                schema = resolveSchema(responseSchema, typedSpec);

                // Extract ref info if the schema itself is a $ref
                if (responseSchema.$ref) {
                  ref = responseSchema.$ref;
                  name = responseSchema.$ref.split('/').pop();
                }
              }
            }

            const responseSummary: GenResponseSummary = {
              status: Number.parseInt(statusCode, 10),
              description,
            };

            if (name) responseSummary.name = name;
            if (ref) responseSummary.ref = ref;
            if (contentType) responseSummary.contentType = contentType;
            if (schema) {
              // Add contentType to schema so it appears in the viewer
              if (contentType) {
                schema.contentType = contentType;
              }
              responseSummary.schema = schema;
            }

            responses.push(responseSummary);
          }
        }

        const operationSummary: GenOperationSummary = {
          id: op.operationId,
          hash: generateOperationHash(method, path, tags),
          method,
          path,
          tags,
          summary: op.summary ?? '',
          description: op.description ?? '',
          deprecated: op.deprecated ?? false,
          hasParams: Object.keys(op.parameters ?? {}).length > 0,
          hasRequestBody: !!op.requestBody,
          xGuard: op['x-guard'],
          xRateLimiter: op['x-rate-limiter'],
        };

        operations.push(operationSummary);

        // Build combined request with path, query, and body sections
        const request: GenRequest = {};

        // Extract path parameters into a 'path' section
        if (op.parameters && Array.isArray(op.parameters)) {
          const pathParamProps: Record<string, import('../../src/modules/docs/types').GenSchemaProperty> = {};
          const queryParamProps: Record<string, import('../../src/modules/docs/types').GenSchemaProperty> = {};

          for (const param of op.parameters) {
            if (param.in !== 'path' && param.in !== 'query') continue;

            const paramSchema = param.schema
              ? resolveSchemaProperty(param.schema, param.required ?? false, typedSpec)
              : { type: 'string' as const, required: param.required ?? false };

            // Add description from param level if not in schema
            if (param.description && !paramSchema.description) {
              paramSchema.description = param.description;
            }

            if (param.in === 'path') {
              pathParamProps[param.name] = paramSchema;
            } else if (param.in === 'query') {
              queryParamProps[param.name] = paramSchema;
            }
          }

          if (Object.keys(pathParamProps).length > 0) {
            request.path = {
              properties: pathParamProps,
            };
          }

          if (Object.keys(queryParamProps).length > 0) {
            request.query = {
              properties: queryParamProps,
            };
          }
        }

        // Extract request body into a 'body' section
        if (op.requestBody) {
          const requestBody = op.requestBody;
          const content = requestBody.content;
          if (content) {
            const contentType = Object.keys(content).find((ct) => ct.includes('json')) || Object.keys(content)[0];
            if (contentType && content[contentType]?.schema) {
              const bodySchema = resolveSchema(content[contentType].schema, typedSpec);
              // Spread all schema properties to avoid missing any, then add body-specific fields
              request.body = {
                ...bodySchema,
                required: requestBody.required ?? false,
                contentType,
              };
            }
          }
        }

        // Create operation detail for per-tag files
        const operationDetail: GenOperationDetail = {
          operationId: op.operationId,
          responses,
        };

        // Only add request if there are any sections
        if (Object.keys(request).length > 0) {
          operationDetail.request = request;
        }

        // Count operations per tag and store details
        for (const tag of tags) {
          const existing = tagMap.get(tag);
          if (existing) {
            existing.count++;
          } else {
            // Tag not in spec but used in operations
            tagMap.set(tag, { count: 1 });
          }

          // Store operation detail for this tag
          const tagDetails = tagDetailsMap.get(tag);
          if (tagDetails) {
            tagDetails.push(operationDetail);
          } else {
            tagDetailsMap.set(tag, [operationDetail]);
          }
        }
      }
    }
  }

  // Convert tag map to array (maintain order from spec)
  const tags: GenTagSummary[] = Array.from(tagMap.entries()).map(([name, data]) => ({
    name,
    description: data.description || undefined,
    count: data.count,
  }));

  // Extract OpenAPI info
  const specInfo = spec.info || {};
  const info: GenInfoSummary = {
    title: specInfo.title ?? '',
    version: specInfo.version ?? '',
    description: specInfo.description ?? '',
    openapiVersion: spec.openapi ?? '',
  };

  // Extract component schemas
  const componentSchemas: GenComponentSchema[] = [];
  const schemaTagCounts: Record<'base' | 'data' | 'errors', number> = { base: 0, data: 0, errors: 0 };
  const typedSpec = spec as OpenApiSpec;

  if (spec.components?.schemas) {
    for (const [schemaName, schemaValue] of Object.entries(spec.components.schemas)) {
      const openApiSchema = schemaValue as OpenApiSchema;

      // Resolve the schema to get full property details
      const resolvedSchema = resolveSchema(openApiSchema, typedSpec);

      // Extract extendsRef if present (from allOf merging)
      const extendsRef = resolvedSchema.extendsRef;

      // Build the ref path for this schema
      const schemaRef = `#/components/schemas/${schemaName}`;

      const schemaTag = getSchemaTag(schemaName);
      schemaTagCounts[schemaTag]++;

      const componentSchema: GenComponentSchema = {
        name: schemaName,
        ref: schemaRef,
        type: resolvedSchema.type,
        schema: resolvedSchema,
        schemaTag,
      };

      // Add optional fields
      if (openApiSchema.description) {
        componentSchema.description = openApiSchema.description;
      }
      if (extendsRef) {
        componentSchema.extendsRef = extendsRef;
      }

      componentSchemas.push(componentSchema);
    }
  }

  // Build schemaTags array from counts with descriptions
  const schemaTagsArray = [
    { name: 'base', description: 'Schemas with base fields only', count: schemaTagCounts.base },
    { name: 'data', description: 'Complete data schemas', count: schemaTagCounts.data },
    { name: 'errors', description: 'Error schemas', count: schemaTagCounts.errors },
  ];

  // Generate the output files
  const operationsContent = generateOperationsFile(operations);
  const tagsContent = generateTagsFile(tags);
  const infoContent = generateInfoFile(info);
  const schemasContent = generateSchemasFile(componentSchemas, schemaTagsArray);

  // Create docs directory
  const docsDir = resolve(plugin.context.config.output.path, 'docs');
  mkdirSync(docsDir, { recursive: true });

  // Create details subdirectory for per-tag detail files
  const detailsDir = resolve(docsDir, 'details');
  mkdirSync(detailsDir, { recursive: true });

  // Generate per-tag detail files
  const tagNames: string[] = [];
  for (const [tagName, tagOperations] of tagDetailsMap.entries()) {
    const tagDetailsContent = generateTagDetailsFile(tagName, tagOperations);
    const tagFilePath = resolve(detailsDir, `${tagName}.gen.ts`);
    writeFileSync(tagFilePath, tagDetailsContent, 'utf-8');
    tagNames.push(tagName);
  }

  // Generate index file
  const indexContent = generateIndexFile(tagNames);

  // Write files to docs directory
  const operationsPath = resolve(docsDir, 'operations.gen.ts');
  const tagsPath = resolve(docsDir, 'tags.gen.ts');
  const infoPath = resolve(docsDir, 'info.gen.ts');
  const schemasPath = resolve(docsDir, 'schemas.gen.ts');
  const indexPath = resolve(docsDir, 'index.ts');

  writeFileSync(operationsPath, operationsContent, 'utf-8');
  writeFileSync(tagsPath, tagsContent, 'utf-8');
  writeFileSync(infoPath, infoContent, 'utf-8');
  writeFileSync(schemasPath, schemasContent, 'utf-8');
  writeFileSync(indexPath, indexContent, 'utf-8');
};

/**
 * Default plugin configuration
 */
export const defaultConfig: OpenApiParserPlugin['Config'] = {
  dependencies: ['@hey-api/typescript'],
  handler,
  name: 'openapi-parser',
  config: {
    output: 'docs-operations',
  },
};

/**
 * Plugin factory function
 */
export const defineConfig = definePluginConfig(defaultConfig);

export default defineConfig;
