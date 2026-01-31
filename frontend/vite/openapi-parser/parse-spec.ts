/**
 * Pure parsing logic for OpenAPI spec transformation.
 * Separated from plugin handler for testability.
 */

import type {
  GenComponentSchema,
  GenExtensionDefinition,
  GenInfoSummary,
  GenOperationDetail,
  GenOperationSummary,
  GenRequest,
  GenResponseSummary,
  GenSchema,
  GenSchemaProperty,
  GenSchemaTagSummary,
  GenTagSummary,
} from '../../src/modules/docs/types';
import { getSchemaTag } from './categorize';
import { generateOperationHash } from './file-generators';
import { resolveSchema, resolveSchemaProperty } from './schema-resolvers';
import type { OpenApiParameter, OpenApiRequestBody, OpenApiSchema, OpenApiSpec } from './types';

/**
 * Result of parsing an OpenAPI spec.
 * Contains all the data needed to generate documentation files.
 */
export interface ParsedOpenApiSpec {
  operations: GenOperationSummary[];
  tags: GenTagSummary[];
  info: GenInfoSummary;
  schemas: GenComponentSchema[];
  schemaTags: GenSchemaTagSummary[];
  tagDetails: Map<string, GenOperationDetail[]>;
}

/**
 * Parse an OpenAPI spec into documentation-ready data structures.
 * This is a pure function with no side effects.
 */
export function parseOpenApiSpec(spec: OpenApiSpec): ParsedOpenApiSpec {
  const operations: GenOperationSummary[] = [];
  const tagMap = new Map<string, { description?: string; count: number }>();
  const tagDetailsMap = new Map<string, GenOperationDetail[]>();

  // Extract extension definitions from info
  const extensionDefs: GenExtensionDefinition[] = spec.info?.['x-extensions'] ?? [];

  // Get tag descriptions from the OpenAPI spec directly
  if (spec.tags) {
    for (const tag of spec.tags) {
      tagMap.set(tag.name, { description: tag.description, count: 0 });
    }
  }

  // Iterate through spec.paths directly to preserve order
  const validMethods = new Set(['get', 'post', 'put', 'delete', 'patch', 'options', 'head']);

  // Helper to resolve $ref to component responses
  const componentResponses = (spec.components?.responses ?? {}) as Record<
    string,
    { description?: string; content?: Record<string, { schema?: OpenApiSchema }> }
  >;

  if (spec.paths) {
    for (const [path, pathItem] of Object.entries(spec.paths)) {
      if (!pathItem) continue;

      // Iterate in the order the methods appear in pathItem
      for (const [method, operation] of Object.entries(pathItem as Record<string, unknown>)) {
        if (!validMethods.has(method)) continue;

        // Type for OpenAPI operation with dynamic x-extensions
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
        } & Record<string, unknown>;

        if (!op?.operationId) continue;

        const opTags = op.tags ?? [];

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
                      schema = resolveSchema(responseSchema, spec);
                    }
                  }
                }
              }
            }

            // Check for inline response content with schema
            const content = (response as { content?: Record<string, { schema?: OpenApiSchema; example?: unknown }> })
              ?.content;
            let example: unknown;
            if (content) {
              const contentTypes = Object.keys(content);
              const jsonType = contentTypes.find((ct) => ct.includes('json'));
              const selectedContentType = jsonType || contentTypes[0];
              if (selectedContentType) {
                const mediaTypeObject = content[selectedContentType];

                if (mediaTypeObject?.schema) {
                  contentType = selectedContentType;
                  const responseSchema = mediaTypeObject.schema;
                  schema = resolveSchema(responseSchema, spec);

                  // Extract ref info if the schema itself is a $ref
                  if (responseSchema.$ref) {
                    ref = responseSchema.$ref;
                    name = responseSchema.$ref.split('/').pop();

                    // Extract example from the referenced component schema
                    if (name && spec.components?.schemas?.[name]) {
                      const componentSchema = spec.components.schemas[name];
                      if (componentSchema.example !== undefined) {
                        example = componentSchema.example;
                      }
                    }
                  }

                  // Check for inline example on the schema itself
                  if (example === undefined && responseSchema.example !== undefined) {
                    example = responseSchema.example;
                  }
                }

                // Check for example at the media type level (preferred in OpenAPI 3.1)
                if (example === undefined && mediaTypeObject?.example !== undefined) {
                  example = mediaTypeObject.example;
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

            // Skip embedding error schemas - they'll be resolved from schemas.gen.json using response.name
            const isErrorSchema = schema?.ref?.endsWith('Error') && schema.ref.includes('/schemas/');
            if (!isErrorSchema && schema) {
              // Add contentType to schema so it appears in the viewer
              if (contentType) {
                schema.contentType = contentType;
              }
              responseSummary.schema = schema;
            }
            if (example !== undefined) responseSummary.example = example;

            responses.push(responseSummary);
          }
        }

        // Check if any success response (2xx) has an example
        const hasExample = responses.some((r) => r.status >= 200 && r.status < 300 && r.example !== undefined);

        // Check if any response has a body (schema)
        const hasResponseBody = responses.some((r) => r.schema !== undefined);

        // Extract extensions dynamically based on extensionDefs
        const extensions: Record<string, string[]> = {};
        for (const ext of extensionDefs) {
          const value = op[ext.key];
          if (Array.isArray(value)) {
            extensions[ext.id] = value;
          }
        }

        const operationSummary: GenOperationSummary = {
          id: op.operationId,
          hash: generateOperationHash(method, path, opTags),
          method,
          path,
          tags: opTags,
          summary: op.summary ?? '',
          description: op.description ?? '',
          deprecated: op.deprecated ?? false,
          hasParams: Object.keys(op.parameters ?? {}).length > 0,
          hasRequestBody: !!op.requestBody,
          hasResponseBody,
          hasExample,
          extensions,
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
              ? resolveSchemaProperty(param.schema, param.required ?? false, spec)
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
              const bodySchema = resolveSchema(content[contentType].schema, spec);
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
        for (const tag of opTags) {
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
    extensions: extensionDefs,
  };

  // Extract component schemas
  const componentSchemas: GenComponentSchema[] = [];
  const schemaTagCounts: Record<'base' | 'data' | 'errors', number> = { base: 0, data: 0, errors: 0 };

  if (spec.components?.schemas) {
    for (const [schemaName, schemaValue] of Object.entries(spec.components.schemas)) {
      const openApiSchema = schemaValue as OpenApiSchema;

      // Resolve the schema to get full property details
      const resolvedSchema = resolveSchema(openApiSchema, spec);

      // Extract extendsRef if present (from allOf merging)
      const extendsRef = resolvedSchema.extendsRef;

      // Build the ref path for this schema
      const schemaRef = `#/components/schemas/${schemaName}`;

      const schemaTag = getSchemaTag(schemaName);
      schemaTagCounts[schemaTag]++;

      // Remove description from nested schema to avoid duplication in UI
      // (description is shown in the card header, not in the JsonViewer)
      const { description: _schemaDescription, ...schemaWithoutDescription } = resolvedSchema;

      const componentSchema: GenComponentSchema = {
        name: schemaName,
        ref: schemaRef,
        type: resolvedSchema.type,
        schema: schemaWithoutDescription as typeof resolvedSchema,
        schemaTag,
      };

      // Add optional fields
      if (openApiSchema.description) {
        componentSchema.description = openApiSchema.description;
      }
      if (extendsRef) {
        componentSchema.extendsRef = extendsRef;
      }
      if (openApiSchema.example !== undefined) {
        componentSchema.example = openApiSchema.example;
      }

      componentSchemas.push(componentSchema);
    }
  }

  // Build schemaTags array from counts with descriptions
  const schemaTags: GenSchemaTagSummary[] = [
    { name: 'base', description: 'Schemas with base fields only', count: schemaTagCounts.base },
    { name: 'data', description: 'Complete data schemas', count: schemaTagCounts.data },
    { name: 'errors', description: 'Error schemas', count: schemaTagCounts.errors },
  ];

  return {
    operations,
    tags,
    info,
    schemas: componentSchemas,
    schemaTags,
    tagDetails: tagDetailsMap,
  };
}
