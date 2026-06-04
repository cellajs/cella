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
} from '../../../../frontend/src/modules/docs/types';
import { config } from '../../../../shared/config/config.default';
import { generateOperationHash } from './file-generators';
import { resolveSchema, resolveSchemaProperty } from './schema-resolvers';
import type { OpenApiReferenceObject, OpenApiResponseObject, OpenApiSpec, OpenApiTag } from './types';

/** Map from pluralized tag names to singular entity types (e.g., 'users' -> 'user') */
const tagToEntityType = new Map<string, string>(config.entityTypes.map((entityType) => [`${entityType}s`, entityType]));

/**
 * Result of parsing an OpenAPI spec.
 * Contains all the data needed to generate documentation files.
 */
interface ParsedOpenApiSpec {
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
  const tagMap = new Map<string, { description?: string; count: number; kind?: string }>();
  const tagDetailsMap = new Map<string, GenOperationDetail[]>();

  // Extract extension definitions from info
  const extensionDefs = (spec.info?.['x-extensions'] ?? []) as GenExtensionDefinition[];

  // Build tag kind map and collect module tags for the tag sidebar.
  // Schema-kind tags are collected separately to drive the schemas page buckets.
  const tagKindMap = new Map<string, string>();
  const excludedTags = new Set<string>();
  const schemaKindTags: { name: string; description: string; isDefault: boolean }[] = [];
  if (spec.tags) {
    for (const tag of spec.tags as readonly OpenApiTag[]) {
      if (tag.kind) tagKindMap.set(tag.name, tag.kind);
      if (tag.kind && tag.kind !== 'module') {
        excludedTags.add(tag.name);
        if (tag.kind === 'schema') {
          schemaKindTags.push({
            name: tag.name,
            description: tag.description ?? '',
            isDefault: tag['x-default'] === true,
          });
        }
        continue;
      }
      tagMap.set(tag.name, { description: tag.description, count: 0, kind: tag.kind });
    }
  }

  const schemaTagNameSet = new Set(schemaKindTags.map((t) => t.name));
  const defaultSchemaTag = schemaKindTags.find((t) => t.isDefault)?.name ?? schemaKindTags[0]?.name ?? 'data';

  // Iterate through spec.paths directly to preserve order
  const httpMethods = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head'] as const;

  // Helper to resolve $ref to component responses
  const componentResponses: Record<string, OpenApiResponseObject> = {};
  if (spec.components?.responses) {
    for (const [name, value] of Object.entries(spec.components.responses)) {
      if (!('$ref' in value)) {
        componentResponses[name] = value;
      }
    }
  }

  if (spec.paths) {
    for (const [path, pathItem] of Object.entries(spec.paths)) {
      if (!pathItem) continue;

      // Iterate using typed method access on PathItemObject
      for (const method of httpMethods) {
        const op = pathItem[method];
        if (!op?.operationId) continue;

        // Strip excluded tags (e.g., ownership tags) from operation tags
        const opTags = (op.tags ?? []).filter((t: string) => !excludedTags.has(t));

        // Extract responses for operation details
        const responses: GenResponseSummary[] = [];
        if (op.responses) {
          for (const [statusCode, responseEntry] of Object.entries(op.responses)) {
            // ResponsesObject index signature includes | unknown, so we need a boundary cast
            const response = responseEntry as OpenApiResponseObject | OpenApiReferenceObject | undefined;
            if (!response) continue;

            let description = '';
            let name: string | undefined;
            let ref: string | undefined;
            let contentType: string | undefined;
            let schema: GenSchema | undefined;

            // Resolve $ref if present (e.g., "#/components/responses/BadRequestError")
            if ('$ref' in response) {
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
            } else {
              description = response.description ?? '';
            }

            // Check for inline response content with schema (only on ResponseObject, not ReferenceObject)
            const content = !('$ref' in response) ? response.content : undefined;
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
          const value = op[ext.key as `x-${string}`];
          if (Array.isArray(value)) {
            extensions[ext.id] = value;
          }
        }

        // Derive entityType from the first tag that matches a known entity type
        const entityType = opTags.map((tag: string) => tagToEntityType.get(tag)).find(Boolean);

        // Group all operation tags by kind
        const allOpTags = op.tags ?? [];
        const tagsByKind: Record<string, string[]> = {};
        for (const tag of allOpTags) {
          const kind = tagKindMap.get(tag) ?? 'other';
          if (!tagsByKind[kind]) tagsByKind[kind] = [];
          tagsByKind[kind].push(tag);
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
          hasParams: (op.parameters ?? []).length > 0,
          hasRequestBody: !!op.requestBody,
          hasResponseBody,
          hasExample,
          extensions,
          tagsByKind,
          ...(entityType && { entityType }),
        };

        operations.push(operationSummary);

        // Build combined request with path, query, and body sections
        const request: GenRequest = {};

        // Extract path parameters into a 'path' section
        if (op.parameters) {
          const pathParamProps: Record<string, GenSchemaProperty> = {};
          const queryParamProps: Record<string, GenSchemaProperty> = {};

          for (const param of op.parameters) {
            if ('$ref' in param) continue;
            if (param.in !== 'path' && param.in !== 'query') continue;

            const paramSchema: GenSchemaProperty = param.schema
              ? resolveSchemaProperty(param.schema, param.required ?? false, spec)
              : { type: 'string', required: param.required ?? false };

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
        if (op.requestBody && !('$ref' in op.requestBody)) {
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
    kind: data.kind,
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

  // Extract component schemas. Each schema's bucket is driven by its `x-tags`
  // extension (intersected with the registered schema-kind tags), with a
  // fallback to the tag flagged `x-default: true`.
  const componentSchemas: GenComponentSchema[] = [];
  const schemaTagCounts = new Map<string, number>(schemaKindTags.map((t) => [t.name, 0]));
  if (!schemaTagCounts.has(defaultSchemaTag)) schemaTagCounts.set(defaultSchemaTag, 0);

  if (spec.components?.schemas) {
    for (const [schemaName, schemaValue] of Object.entries(spec.components.schemas)) {
      // Resolve the schema to get full property details
      const resolvedSchema = resolveSchema(schemaValue, spec);

      // Extract extendsRef if present (from allOf merging)
      const extendsRef = resolvedSchema.extendsRef;

      // Build the ref path for this schema
      const schemaRef = `#/components/schemas/${schemaName}`;

      // Resolve schema tag from x-tags (first match against schema-kind tags), else default.
      const xTags = (schemaValue as { 'x-tags'?: unknown })['x-tags'];
      const declaredTags = Array.isArray(xTags)
        ? (xTags as unknown[]).filter((t): t is string => typeof t === 'string')
        : [];
      const schemaTag = declaredTags.find((t) => schemaTagNameSet.has(t)) ?? defaultSchemaTag;
      schemaTagCounts.set(schemaTag, (schemaTagCounts.get(schemaTag) ?? 0) + 1);

      // Group declared tags by their registered kind (mirrors operation tagsByKind).
      const tagsByKind: Record<string, string[]> = {};
      for (const tag of declaredTags) {
        const kind = tagKindMap.get(tag) ?? 'other';
        if (!tagsByKind[kind]) tagsByKind[kind] = [];
        tagsByKind[kind].push(tag);
      }

      // Remove description from nested schema to avoid duplication in UI
      // (description is shown in the card header, not in the JsonViewer)
      const { description: _schemaDescription, ...schemaWithoutDescription } = resolvedSchema;

      const componentSchema: GenComponentSchema = {
        name: schemaName,
        ref: schemaRef,
        type: resolvedSchema.type,
        schema: schemaWithoutDescription,
        schemaTag,
        tagsByKind,
      };

      // Add optional fields
      if (schemaValue.description) {
        componentSchema.description = schemaValue.description;
      }
      if (extendsRef) {
        componentSchema.extendsRef = extendsRef;
      }
      if (schemaValue.example !== undefined) {
        componentSchema.example = schemaValue.example;
      }

      componentSchemas.push(componentSchema);
    }
  }

  // Sort schemas by ownership tag (primary), module tag (secondary), then name
  // for a readable, grouped display order. Raw OpenAPI order reflects route-traversal
  // registration order, which appears random. Schemas missing a tag sort to the end
  // of that level.
  componentSchemas.sort((a, b) => {
    const ownershipA = a.tagsByKind?.ownership?.[0] ?? '';
    const ownershipB = b.tagsByKind?.ownership?.[0] ?? '';
    if (ownershipA !== ownershipB) {
      if (!ownershipA) return 1;
      if (!ownershipB) return -1;
      return ownershipA.localeCompare(ownershipB);
    }
    const moduleA = a.tagsByKind?.module?.[0] ?? '';
    const moduleB = b.tagsByKind?.module?.[0] ?? '';
    if (moduleA !== moduleB) {
      if (!moduleA) return 1;
      if (!moduleB) return -1;
      return moduleA.localeCompare(moduleB);
    }
    return a.name.localeCompare(b.name);
  });

  // Build schemaTags array from registered schema-kind tags (preserves backend order)
  const schemaTags: GenSchemaTagSummary[] = schemaKindTags.map((t) => ({
    name: t.name,
    description: t.description,
    count: schemaTagCounts.get(t.name) ?? 0,
  }));

  return {
    operations,
    tags,
    info,
    schemas: componentSchemas,
    schemaTags,
    tagDetails: tagDetailsMap,
  };
}
