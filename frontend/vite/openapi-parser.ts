import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DefinePlugin } from '@hey-api/openapi-ts';
import { definePluginConfig } from '@hey-api/openapi-ts';
import type {
  GenInfoSummary,
  GenOperationDetail,
  GenOperationSummary,
  GenRequest,
  GenResponseSummary,
  GenSchema,
  GenSchemaProperty,
  GenTagSummary,
} from '../src/modules/docs/types';

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

// Type definitions for OpenAPI schema structures
type OpenApiSchema = {
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
};

type OpenApiParameter = {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required?: boolean;
  description?: string;
  schema?: OpenApiSchema;
  $ref?: string;
};

type OpenApiRequestBody = {
  required?: boolean;
  content?: Record<string, { schema?: OpenApiSchema }>;
  $ref?: string;
};

type OpenApiSpec = {
  openapi?: string;
  info?: { title?: string; version?: string; description?: string };
  tags?: { name: string; description?: string }[];
  components?: {
    schemas?: Record<string, OpenApiSchema>;
    responses?: Record<string, { description?: string; content?: Record<string, { schema?: OpenApiSchema }> }>;
  };
  paths?: Record<string, Record<string, unknown>>;
};

/**
 * Resolves a $ref path to the actual schema from components
 */
function resolveRef(ref: string, spec: OpenApiSpec): { schema: OpenApiSchema | undefined; name: string } {
  // Handle refs like "#/components/schemas/User" or "#/components/responses/BadRequestError"
  const parts = ref.split('/');
  const name = parts[parts.length - 1];

  if (ref.startsWith('#/components/schemas/')) {
    return { schema: spec.components?.schemas?.[name], name };
  }
  if (ref.startsWith('#/components/responses/')) {
    const response = spec.components?.responses?.[name];
    const schema = response?.content?.['application/json']?.schema;
    return { schema, name };
  }

  return { schema: undefined, name };
}

/**
 * Merges allOf schemas into a single flat schema.
 * Properties from later schemas override earlier ones.
 * Required arrays are combined.
 * The first $ref encountered is preserved as extendsRef for inheritance tracking.
 */
function mergeAllOfSchemas(
  allOfSchemas: OpenApiSchema[],
  spec: OpenApiSpec,
  visited: Set<string>,
): { mergedSchema: OpenApiSchema; extendsRef?: string } {
  let extendsRef: string | undefined;
  const mergedProperties: Record<string, OpenApiSchema> = {};
  const mergedRequired: string[] = [];
  let mergedType: string | string[] | undefined;
  let mergedDescription: string | undefined;

  for (const subSchema of allOfSchemas) {
    let resolvedSubSchema = subSchema;

    // If it's a $ref, resolve it and track the first one as extendsRef
    if (subSchema.$ref) {
      if (!extendsRef) {
        extendsRef = subSchema.$ref;
      }
      const { schema: resolved } = resolveRef(subSchema.$ref, spec);
      if (resolved) {
        resolvedSubSchema = resolved;
      }
    }

    // Recursively handle nested allOf
    if (resolvedSubSchema.allOf) {
      const { mergedSchema: nestedMerged, extendsRef: nestedRef } = mergeAllOfSchemas(
        resolvedSubSchema.allOf,
        spec,
        visited,
      );
      resolvedSubSchema = nestedMerged;
      if (!extendsRef && nestedRef) {
        extendsRef = nestedRef;
      }
    }

    // Merge type (prefer object if any)
    if (resolvedSubSchema.type) {
      mergedType = resolvedSubSchema.type;
    }

    // Merge description (prefer later)
    if (resolvedSubSchema.description) {
      mergedDescription = resolvedSubSchema.description;
    }

    // Merge properties
    if (resolvedSubSchema.properties) {
      for (const [key, value] of Object.entries(resolvedSubSchema.properties)) {
        mergedProperties[key] = value;
      }
    }

    // Merge required arrays
    if (resolvedSubSchema.required) {
      for (const req of resolvedSubSchema.required) {
        if (!mergedRequired.includes(req)) {
          mergedRequired.push(req);
        }
      }
    }
  }

  const mergedSchema: OpenApiSchema = {
    type: mergedType || 'object',
    properties: Object.keys(mergedProperties).length > 0 ? mergedProperties : undefined,
    required: mergedRequired.length > 0 ? mergedRequired : undefined,
    description: mergedDescription,
  };

  return { mergedSchema, extendsRef };
}

/**
 * Resolves an OpenAPI schema to a GenSchemaProperty, dereferencing $refs
 * and converting the required array to inline required fields.
 */
function resolveSchemaProperty(
  schema: OpenApiSchema,
  isRequired: boolean,
  spec: OpenApiSpec,
  visited: Set<string> = new Set(),
): GenSchemaProperty {
  // Handle $ref
  if (schema.$ref) {
    // Prevent circular references
    if (visited.has(schema.$ref)) {
      return {
        type: 'object',
        required: isRequired,
        ref: schema.$ref,
        refDescription: '(circular reference)',
      };
    }

    const newVisited = new Set(visited);
    newVisited.add(schema.$ref);

    const { schema: resolved } = resolveRef(schema.$ref, spec);
    if (resolved) {
      const result = resolveSchemaProperty(resolved, isRequired, spec, newVisited);
      // Add ref metadata
      result.ref = schema.$ref;
      if (resolved.description) {
        result.refDescription = resolved.description;
      }
      return result;
    }

    // Unresolved ref
    return {
      type: 'object',
      required: isRequired,
      ref: schema.$ref,
    };
  }

  const prop: GenSchemaProperty = {
    type: schema.type || 'object',
    required: isRequired,
  };

  // Copy description
  if (schema.description) prop.description = schema.description;

  // Copy format constraints
  if (schema.format) prop.format = schema.format;
  if (schema.enum) prop.enum = schema.enum;
  if (schema.minimum !== undefined) prop.minimum = schema.minimum;
  if (schema.maximum !== undefined) prop.maximum = schema.maximum;
  if (schema.minLength !== undefined) prop.minLength = schema.minLength;
  if (schema.maxLength !== undefined) prop.maxLength = schema.maxLength;
  if (schema.minItems !== undefined) prop.minItems = schema.minItems;
  if (schema.maxItems !== undefined) prop.maxItems = schema.maxItems;

  // Handle nested object properties
  if (schema.properties) {
    const requiredSet = new Set(schema.required || []);
    prop.properties = {};
    for (const [key, value] of Object.entries(schema.properties)) {
      prop.properties[key] = resolveSchemaProperty(value, requiredSet.has(key), spec, visited);
    }
  }

  // Handle array items - unwrap simple items to parent level
  if (schema.items) {
    // Note: we pass false for isRequired since array items don't have a meaningful required field
    // (items are either present in the array or not - there's no "optional" array element concept)
    const resolvedItem = resolveSchemaProperty(schema.items, false, spec, visited);
    // Remove the redundant 'required' field from array items
    delete (resolvedItem as { required?: boolean }).required;
    // Check if item is "complex" (has nested properties or items)
    const isComplexItem = resolvedItem.properties || resolvedItem.items || resolvedItem.anyOf || resolvedItem.oneOf;

    // Always set itemType from the resolved item type
    prop.itemType = resolvedItem.type;

    // Unwrap simple item properties to parent (enum, format, ref, etc.)
    if (resolvedItem.enum) prop.enum = resolvedItem.enum;
    if (resolvedItem.format) prop.format = resolvedItem.format;
    if (resolvedItem.ref) prop.ref = resolvedItem.ref;
    if (resolvedItem.refDescription) prop.refDescription = resolvedItem.refDescription;
    if (resolvedItem.minimum !== undefined) prop.minimum = resolvedItem.minimum;
    if (resolvedItem.maximum !== undefined) prop.maximum = resolvedItem.maximum;
    if (resolvedItem.minLength !== undefined) prop.minLength = resolvedItem.minLength;
    if (resolvedItem.maxLength !== undefined) prop.maxLength = resolvedItem.maxLength;

    // Only keep full items for complex nested structures
    if (isComplexItem) {
      prop.items = resolvedItem;
    }
  }

  // Handle composition keywords
  if (schema.anyOf) {
    prop.anyOf = schema.anyOf.map((s) => resolveSchemaProperty(s, false, spec, visited));
  }
  if (schema.oneOf) {
    prop.oneOf = schema.oneOf.map((s) => resolveSchemaProperty(s, false, spec, visited));
  }
  // Handle allOf by merging into a flat schema
  if (schema.allOf) {
    const { mergedSchema, extendsRef } = mergeAllOfSchemas(schema.allOf, spec, visited);
    // Recursively resolve the merged schema
    const merged = resolveSchemaProperty(mergedSchema, isRequired, spec, visited);
    // Preserve inheritance info
    if (extendsRef) {
      merged.extendsRef = extendsRef;
    }
    return merged;
  }

  return prop;
}

/**
 * Resolves an OpenAPI schema to a top-level GenSchema for response bodies.
 * Preserves reference metadata when dereferencing.
 */
function resolveSchema(schema: OpenApiSchema, spec: OpenApiSpec, visited: Set<string> = new Set()): GenSchema {
  // Handle $ref at top level
  if (schema.$ref) {
    // Prevent circular references
    if (visited.has(schema.$ref)) {
      return {
        type: 'object',
        ref: schema.$ref,
        refDescription: '(circular reference)',
      };
    }

    const newVisited = new Set(visited);
    newVisited.add(schema.$ref);

    const { schema: resolved } = resolveRef(schema.$ref, spec);
    if (resolved) {
      const result = resolveSchema(resolved, spec, newVisited);
      // Preserve original ref info
      result.ref = schema.$ref;
      if (resolved.description) {
        result.refDescription = resolved.description;
      }
      return result;
    }

    // Unresolved ref
    return {
      type: 'object',
      ref: schema.$ref,
    };
  }

  const result: GenSchema = {
    type: schema.type || 'object',
  };

  // Copy description
  if (schema.description) {
    result.refDescription = schema.description;
  }

  // Handle enum
  if (schema.enum) {
    result.enum = schema.enum;
  }

  // Handle nested object properties
  if (schema.properties) {
    const requiredSet = new Set(schema.required || []);
    result.properties = {};
    for (const [key, value] of Object.entries(schema.properties)) {
      result.properties[key] = resolveSchemaProperty(value, requiredSet.has(key), spec, visited);
    }
  }

  // Handle array items - unwrap simple items to parent level
  if (schema.items) {
    const resolvedItem = resolveSchemaProperty(schema.items, true, spec, visited);
    // Check if item is "complex" (has nested properties or items)
    const isComplexItem = resolvedItem.properties || resolvedItem.items || resolvedItem.anyOf || resolvedItem.oneOf;

    // Always set itemType from the resolved item type
    result.itemType = resolvedItem.type;

    // Unwrap simple item properties to parent (enum, format, ref, etc.)
    if (resolvedItem.enum) result.enum = resolvedItem.enum;
    if (resolvedItem.ref) result.ref = resolvedItem.ref;
    if (resolvedItem.refDescription) result.refDescription = resolvedItem.refDescription;

    // Only keep full items for complex nested structures
    if (isComplexItem) {
      result.items = resolvedItem;
    }
  }

  // Handle composition keywords
  if (schema.anyOf) {
    result.anyOf = schema.anyOf.map((s) => resolveSchema(s, spec, visited));
  }
  if (schema.oneOf) {
    result.oneOf = schema.oneOf.map((s) => resolveSchema(s, spec, visited));
  }
  // Handle allOf by merging into a flat schema
  if (schema.allOf) {
    const { mergedSchema, extendsRef } = mergeAllOfSchemas(schema.allOf, spec, visited);
    // Recursively resolve the merged schema
    const merged = resolveSchema(mergedSchema, spec, visited);
    // Preserve inheritance info
    if (extendsRef) {
      merged.extendsRef = extendsRef;
    }
    return merged;
  }

  return result;
}

/**
 * Configuration options for the openapi-parser plugin.
 */
type Config = {
  name: 'openapi-parser';
  output?: string;
};

type OpenApiParserPlugin = DefinePlugin<Config>;

/**
 * Generate a Scalar-like hash for an operation
 * Format: tag/{tagName}/{METHOD}{path}
 * Example: tag/system/POST/system/paddle-webhook
 */
function generateOperationHash(method: string, path: string, tags: string[]): string {
  const tag = tags[0] || 'default';
  // Remove leading slash and convert path for hash
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `tag/${tag}/${method.toUpperCase()}/${cleanPath}`;
}

/**
 * Generate the operations file content
 */
function generateOperationsFile(operations: GenOperationSummary[]): string {
  return `// This file is auto-generated by openapi-parser plugin
import type { GenOperationSummary } from '~/modules/docs/types';

export const operations: GenOperationSummary[] = ${JSON.stringify(operations, null, 2)};
`;
}

/**
 * Generate the tags file content
 */
function generateTagsFile(tags: GenTagSummary[]): string {
  const tagNamesArray = tags.map((t) => `'${t.name}'`).join(', ');
  return `// This file is auto-generated by openapi-parser plugin
import type { GenTagSummary } from '~/modules/docs/types';

/**
 * Tag names as const tuple for type-safe enum validation
 */
export const tagNames = [${tagNamesArray}] as const;

export type TagName = (typeof tagNames)[number];

export const tags: GenTagSummary[] = ${JSON.stringify(tags, null, 2)};
`;
}

/**
 * Generate the info file content
 */
function generateInfoFile(info: GenInfoSummary): string {
  return `// This file is auto-generated by openapi-parser plugin
import type { GenInfoSummary } from '~/modules/docs/types';

export const info: GenInfoSummary = ${JSON.stringify(info, null, 2)};
`;
}

/**
 * Generate the tag details file content for a specific tag
 */
function generateTagDetailsFile(tagName: string, operations: GenOperationDetail[]): string {
  return `// This file is auto-generated by openapi-parser plugin
import type { GenOperationDetail } from '~/modules/docs/types';

export const tagName = '${tagName}' as const;

export const operations: GenOperationDetail[] = ${JSON.stringify(operations, null, 2)};
`;
}

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
          const pathParamProps: Record<string, GenSchemaProperty> = {};
          const queryParamProps: Record<string, GenSchemaProperty> = {};

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
              // Keep required since body itself can be optional/required
              request.body = {
                required: requestBody.required ?? false,
                contentType,
                properties: bodySchema.properties,
                items: bodySchema.items,
                itemType: bodySchema.itemType,
                enum: bodySchema.enum,
                ref: bodySchema.ref,
                refDescription: bodySchema.refDescription,
                extendsRef: bodySchema.extendsRef,
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

  // Generate the output files
  const operationsContent = generateOperationsFile(operations);
  const tagsContent = generateTagsFile(tags);
  const infoContent = generateInfoFile(info);

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

  // Generate index file with exports for all files
  const tagExports = tagNames.map((name) => `export * as ${name} from './details/${name}.gen';`).join('\n');
  const indexContent = `// This file is auto-generated by openapi-parser plugin

// Re-export types from central location
export type { GenInfoSummary, GenOperationDetail, GenOperationSummary, GenResponseSummary, GenTagSummary } from '~/modules/docs/types';

export * from './info.gen';
export * from './operations.gen';
export * from './tags.gen';

// Per-tag operation details (lazy-loadable)
${tagExports}
`;

  // Write files to docs directory
  const operationsPath = resolve(docsDir, 'operations.gen.ts');
  const tagsPath = resolve(docsDir, 'tags.gen.ts');
  const infoPath = resolve(docsDir, 'info.gen.ts');
  const indexPath = resolve(docsDir, 'index.ts');

  writeFileSync(operationsPath, operationsContent, 'utf-8');
  writeFileSync(tagsPath, tagsContent, 'utf-8');
  writeFileSync(infoPath, infoContent, 'utf-8');
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
