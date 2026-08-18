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
import { appConfig } from '../../../../shared';
import { config } from '../../../../shared/config/config.default';
import { generateOperationHash } from './file-generators';
import { resolveSchema, resolveSchemaProperty } from './schema-resolvers';
import type { OpenApiReferenceObject, OpenApiResponseObject, OpenApiSpec, OpenApiTag } from './types';

/** Map from pluralized tag names to singular entity types (e.g., 'users' -> 'user') */
const tagToEntityType = new Map<string, string>(config.entityTypes.map((entityType) => [`${entityType}s`, entityType]));

/** Service modules (appConfig.services) that resolve to disabled in this build's effective config. */
const disabledServices = new Set(
  Object.entries(appConfig.services)
    .filter(([, service]) => service.enabled === false)
    .map(([slug]) => slug),
);

interface ParsedOpenApiSpec {
  operations: GenOperationSummary[];
  tags: GenTagSummary[];
  info: GenInfoSummary;
  schemas: GenComponentSchema[];
  schemaTags: GenSchemaTagSummary[];
  tagDetails: Map<string, GenOperationDetail[]>;
}

/** Pure function, kept separate from the plugin handler for testability. */
export function parseOpenApiSpec(spec: OpenApiSpec): ParsedOpenApiSpec {
  const operations: GenOperationSummary[] = [];
  const tagMap = new Map<string, { description?: string; count: number; kind?: string }>();
  const tagDetailsMap = new Map<string, GenOperationDetail[]>();
  // Count operations dropped by a hidden-kind tag so the overview can report the documented/hidden split.
  let hiddenOperationCount = 0;

  const extensionDefs = (spec.info?.['x-extensions'] ?? []) as GenExtensionDefinition[];

  // Tag kinds: module feeds the sidebar, schema feeds the schemas page buckets, hidden drops its operations.
  const tagKindMap = new Map<string, string>();
  const excludedTags = new Set<string>();
  const hiddenTags = new Set<string>();
  const schemaKindTags: { name: string; description: string; isDefault: boolean }[] = [];
  if (spec.tags) {
    for (const tag of spec.tags as readonly OpenApiTag[]) {
      if (tag.kind) tagKindMap.set(tag.name, tag.kind);
      if (tag.kind && tag.kind !== 'module') {
        excludedTags.add(tag.name);
        if (tag.kind === 'hidden') hiddenTags.add(tag.name);
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

  // Iterating spec.paths directly preserves order.
  const httpMethods = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head'] as const;

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

      for (const method of httpMethods) {
        const op = pathItem[method];
        if (!op?.operationId) continue;

        // Operations gated by a disabled service are dropped from the docs, keeping the SDK a stable superset.
        const service = op['x-service' as `x-${string}`];
        if (typeof service === 'string' && disabledServices.has(service)) continue;

        // Hidden-tagged operations stay in openapi.json and the SDK but drop from docs and search.
        if ((op.tags ?? []).some((t: string) => hiddenTags.has(t))) {
          hiddenOperationCount++;
          continue;
        }

        const opTags = (op.tags ?? []).filter((t: string) => !excludedTags.has(t));

        const responses: GenResponseSummary[] = [];
        if (op.responses) {
          for (const [statusCode, responseEntry] of Object.entries(op.responses)) {
            // The ResponsesObject index signature includes `unknown`, so a boundary cast is required.
            const response = responseEntry as OpenApiResponseObject | OpenApiReferenceObject | undefined;
            if (!response) continue;

            let description = '';
            let name: string | undefined;
            let ref: string | undefined;
            let contentType: string | undefined;
            let schema: GenSchema | undefined;

            if ('$ref' in response) {
              ref = response.$ref;
              name = response.$ref.split('/').pop();
              if (name && componentResponses[name]) {
                const componentResponse = componentResponses[name];
                description = componentResponse.description ?? '';
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

                  if (responseSchema.$ref) {
                    ref = responseSchema.$ref;
                    name = responseSchema.$ref.split('/').pop();

                    if (name && spec.components?.schemas?.[name]) {
                      const componentSchema = spec.components.schemas[name];
                      if (componentSchema.example !== undefined) {
                        example = componentSchema.example;
                      }
                    }
                  }

                  if (example === undefined && responseSchema.example !== undefined) {
                    example = responseSchema.example;
                  }
                }

                // OpenAPI 3.1 prefers the example at the media type level.
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

            // Error schemas are not embedded: the viewer resolves them from schemas.gen.json by response.name.
            const isErrorSchema = schema?.ref?.endsWith('Error') && schema.ref.includes('/schemas/');
            if (!isErrorSchema && schema) {
              if (contentType) {
                schema.contentType = contentType;
              }
              responseSummary.schema = schema;
            }
            if (example !== undefined) responseSummary.example = example;

            responses.push(responseSummary);
          }
        }

        const hasExample = responses.some((r) => r.status >= 200 && r.status < 300 && r.example !== undefined);

        const hasResponseBody = responses.some((r) => r.schema !== undefined);

        const extensions: Record<string, string[]> = {};
        for (const ext of extensionDefs) {
          const value = op[ext.key as `x-${string}`];
          if (Array.isArray(value)) {
            extensions[ext.id] = value;
          }
        }

        const entityType = opTags.map((tag: string) => tagToEntityType.get(tag)).find(Boolean);

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

        const request: GenRequest = {};

        if (op.parameters) {
          const pathParamProps: Record<string, GenSchemaProperty> = {};
          const queryParamProps: Record<string, GenSchemaProperty> = {};

          for (const param of op.parameters) {
            if ('$ref' in param) continue;
            if (param.in !== 'path' && param.in !== 'query') continue;

            const paramSchema: GenSchemaProperty = param.schema
              ? resolveSchemaProperty(param.schema, param.required ?? false, spec)
              : { type: 'string', required: param.required ?? false };

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

        if (op.requestBody && !('$ref' in op.requestBody)) {
          const requestBody = op.requestBody;
          const content = requestBody.content;
          if (content) {
            const contentType = Object.keys(content).find((ct) => ct.includes('json')) || Object.keys(content)[0];
            if (contentType && content[contentType]?.schema) {
              const bodySchema = resolveSchema(content[contentType].schema, spec);
              request.body = {
                ...bodySchema,
                required: requestBody.required ?? false,
                contentType,
              };
            }
          }
        }

        const operationDetail: GenOperationDetail = {
          operationId: op.operationId,
          responses,
        };

        if (Object.keys(request).length > 0) {
          operationDetail.request = request;
        }

        for (const tag of opTags) {
          const existing = tagMap.get(tag);
          if (existing) {
            existing.count++;
          } else {
            // Used by an operation but absent from spec.tags.
            tagMap.set(tag, { count: 1 });
          }

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

  // Array order follows the spec's tag order.
  const tags: GenTagSummary[] = Array.from(tagMap.entries()).map(([name, data]) => ({
    name,
    description: data.description || undefined,
    count: data.count,
    kind: data.kind,
  }));

  const specInfo = spec.info || {};
  const info: GenInfoSummary = {
    title: specInfo.title ?? '',
    version: specInfo.version ?? '',
    description: specInfo.description ?? '',
    openapiVersion: spec.openapi ?? '',
    // documented = emitted to the docs; hidden = dropped by a hidden-kind tag. Service-disabled ops count as neither.
    documentedOperationCount: operations.length,
    hiddenOperationCount,
    extensions: extensionDefs,
  };

  // A schema's bucket comes from its `x-tags`, intersected with the registered schema-kind tags, falling back to the `x-default: true` tag.
  const componentSchemas: GenComponentSchema[] = [];
  const schemaTagCounts = new Map<string, number>(schemaKindTags.map((t) => [t.name, 0]));
  if (!schemaTagCounts.has(defaultSchemaTag)) schemaTagCounts.set(defaultSchemaTag, 0);

  if (spec.components?.schemas) {
    for (const [schemaName, schemaValue] of Object.entries(spec.components.schemas)) {
      const resolvedSchema = resolveSchema(schemaValue, spec);

      // extendsRef is set by allOf merging.
      const extendsRef = resolvedSchema.extendsRef;

      const schemaRef = `#/components/schemas/${schemaName}`;

      const xTags = (schemaValue as { 'x-tags'?: unknown })['x-tags'];
      const declaredTags = Array.isArray(xTags)
        ? (xTags as unknown[]).filter((t): t is string => typeof t === 'string')
        : [];
      const schemaTag = declaredTags.find((t) => schemaTagNameSet.has(t)) ?? defaultSchemaTag;
      schemaTagCounts.set(schemaTag, (schemaTagCounts.get(schemaTag) ?? 0) + 1);

      const tagsByKind: Record<string, string[]> = {};
      for (const tag of declaredTags) {
        const kind = tagKindMap.get(tag) ?? 'other';
        if (!tagsByKind[kind]) tagsByKind[kind] = [];
        tagsByKind[kind].push(tag);
      }

      // The card header shows the description, so the nested schema drops it.
      const { description: _schemaDescription, ...schemaWithoutDescription } = resolvedSchema;

      const componentSchema: GenComponentSchema = {
        name: schemaName,
        ref: schemaRef,
        type: resolvedSchema.type,
        schema: schemaWithoutDescription,
        schemaTag,
        tagsByKind,
      };

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

  // Sorted by ownership, module, and name for stable output; untagged schemas sort last at their level.
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

  // Preserves the backend's schema-kind tag order.
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
