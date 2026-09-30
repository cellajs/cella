import { appConfig } from 'shared';
import { config } from 'shared/config/config.default';
import type {
  GenComponentSchema,
  GenExtensionDefinition,
  GenInfoSummary,
  GenOperationDetail,
  GenOperationSummary,
  GenRequest,
  GenResponseSummary,
  GenSchema,
  GenSchemaTagSummary,
  GenTagSummary,
} from '../../docs-types';
import { generateOperationHash } from './operation-hash';
import { resolveSchema, resolveSchemaProperty } from './schema-resolvers';
import type { OpenApiOperation, OpenApiReferenceObject, OpenApiResponseObject, OpenApiSpec, OpenApiTag } from './types';

/** Map from pluralized tag names to singular entity types (e.g., 'users' -> 'user') */
const tagToEntityType = new Map<string, string>(config.entityTypes.map((entityType) => [`${entityType}s`, entityType]));

/** Service modules (appConfig.services) that resolve to disabled in this build's effective config. */
const disabledServices = new Set(
  Object.entries(appConfig.services)
    .filter(([, service]) => service.enabled === false)
    .map(([slug]) => slug),
);

// Iterating spec.paths directly preserves order.
const httpMethods = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head'] as const;

interface ParsedOpenApiSpec {
  operations: GenOperationSummary[];
  tags: GenTagSummary[];
  info: GenInfoSummary;
  schemas: GenComponentSchema[];
  schemaTags: GenSchemaTagSummary[];
  tagDetails: Map<string, GenOperationDetail[]>;
}

/** Prefers a JSON media type, falling back to the first declared one. */
function pickContentType(content: Record<string, unknown>): string | undefined {
  const types = Object.keys(content);
  return types.find((ct) => ct.includes('json')) ?? types[0];
}

/** Groups tag names by their registered kind; unregistered tags land under 'other'. */
function groupTagsByKind(tags: readonly string[], tagKindMap: Map<string, string>): Record<string, string[]> {
  const byKind: Record<string, string[]> = {};
  for (const tag of tags) {
    const kind = tagKindMap.get(tag) ?? 'other';
    byKind[kind] ??= [];
    byKind[kind].push(tag);
  }
  return byKind;
}

/** Resolves one response entry: a `$ref` to a component response, or an inline response with its schema and example. */
function summarizeResponse(
  statusCode: string,
  response: OpenApiResponseObject | OpenApiReferenceObject,
  spec: OpenApiSpec,
  componentResponses: Record<string, OpenApiResponseObject>,
): GenResponseSummary {
  let description = '';
  let name: string | undefined;
  let ref: string | undefined;
  let contentType: string | undefined;
  let schema: GenSchema | undefined;
  let example: unknown;

  if ('$ref' in response) {
    ref = response.$ref;
    name = ref.split('/').pop();
    const component = name ? componentResponses[name] : undefined;
    if (component) {
      description = component.description ?? '';
      contentType = component.content ? pickContentType(component.content) : undefined;
      const componentSchema = contentType ? component.content?.[contentType]?.schema : undefined;
      if (componentSchema) schema = resolveSchema(componentSchema, spec);
    }
  } else {
    description = response.description ?? '';
    const selected = response.content ? pickContentType(response.content) : undefined;
    const mediaType = selected ? response.content?.[selected] : undefined;
    if (selected && mediaType?.schema) {
      contentType = selected;
      schema = resolveSchema(mediaType.schema, spec);

      if (mediaType.schema.$ref) {
        ref = mediaType.schema.$ref;
        name = ref.split('/').pop();
        const componentExample = name ? spec.components?.schemas?.[name]?.example : undefined;
        if (componentExample !== undefined) example = componentExample;
      }
      if (example === undefined && mediaType.schema.example !== undefined) example = mediaType.schema.example;
    }
    // OpenAPI 3.1 prefers the example at the media type level.
    if (example === undefined && mediaType?.example !== undefined) example = mediaType.example;
  }

  const summary: GenResponseSummary = { status: Number.parseInt(statusCode, 10), description };
  if (name) summary.name = name;
  if (ref) summary.ref = ref;
  if (contentType) summary.contentType = contentType;

  // Error schemas are not embedded: the viewer resolves them from schemas.gen.json by response.name.
  const isErrorSchema = schema?.ref?.endsWith('Error') && schema.ref.includes('/schemas/');
  if (schema && !isErrorSchema) {
    if (contentType) schema.contentType = contentType;
    summary.schema = schema;
  }
  if (example !== undefined) summary.example = example;

  return summary;
}

/** Path and query parameters plus the request body, or undefined when the operation takes none. */
function buildRequest(op: OpenApiOperation, spec: OpenApiSpec): GenRequest | undefined {
  const request: GenRequest = {};

  if (op.parameters) {
    const pathParams: Record<string, GenSchema> = {};
    const queryParams: Record<string, GenSchema> = {};

    for (const param of op.parameters) {
      if ('$ref' in param) continue;
      if (param.in !== 'path' && param.in !== 'query') continue;

      const paramSchema: GenSchema = param.schema
        ? resolveSchemaProperty(param.schema, param.required ?? false, spec)
        : { type: 'string', required: param.required ?? false };

      if (param.description && !paramSchema.description) {
        paramSchema.description = param.description;
      }

      (param.in === 'path' ? pathParams : queryParams)[param.name] = paramSchema;
    }

    if (Object.keys(pathParams).length > 0) request.path = { properties: pathParams };
    if (Object.keys(queryParams).length > 0) request.query = { properties: queryParams };
  }

  if (op.requestBody && !('$ref' in op.requestBody)) {
    const content = op.requestBody.content;
    const contentType = content ? pickContentType(content) : undefined;
    const bodySchema = contentType ? content?.[contentType]?.schema : undefined;
    if (contentType && bodySchema) {
      request.body = { ...resolveSchema(bodySchema, spec), required: op.requestBody.required ?? false, contentType };
    }
  }

  return Object.keys(request).length > 0 ? request : undefined;
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
  for (const tag of (spec.tags ?? []) as readonly OpenApiTag[]) {
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

  const schemaTagNameSet = new Set(schemaKindTags.map((t) => t.name));
  const defaultSchemaTag = schemaKindTags.find((t) => t.isDefault)?.name ?? schemaKindTags[0]?.name ?? 'data';

  const componentResponses: Record<string, OpenApiResponseObject> = {};
  for (const [name, value] of Object.entries(spec.components?.responses ?? {})) {
    if (!('$ref' in value)) componentResponses[name] = value;
  }

  for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
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
      for (const [statusCode, entry] of Object.entries(op.responses ?? {})) {
        // The ResponsesObject index signature includes `unknown`, so a boundary cast is required.
        const response = entry as OpenApiResponseObject | OpenApiReferenceObject | undefined;
        if (response) responses.push(summarizeResponse(statusCode, response, spec, componentResponses));
      }

      const extensions: Record<string, string[]> = {};
      for (const ext of extensionDefs) {
        const value = op[ext.key as `x-${string}`];
        if (Array.isArray(value)) extensions[ext.id] = value;
      }

      const entityType = opTags.map((tag: string) => tagToEntityType.get(tag)).find(Boolean);

      operations.push({
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
        hasResponseBody: responses.some((r) => r.schema !== undefined),
        hasExample: responses.some((r) => r.status >= 200 && r.status < 300 && r.example !== undefined),
        extensions,
        tagsByKind: groupTagsByKind(op.tags ?? [], tagKindMap),
        ...(entityType && { entityType }),
      });

      const operationDetail: GenOperationDetail = { operationId: op.operationId, responses };
      const request = buildRequest(op, spec);
      if (request) operationDetail.request = request;

      for (const tag of opTags) {
        // A tag used by an operation but absent from spec.tags starts without a description.
        const tagEntry = tagMap.get(tag) ?? { count: 0 };
        tagEntry.count++;
        tagMap.set(tag, tagEntry);

        const details = tagDetailsMap.get(tag) ?? [];
        details.push(operationDetail);
        tagDetailsMap.set(tag, details);
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

  for (const [schemaName, schemaValue] of Object.entries(spec.components?.schemas ?? {})) {
    const resolvedSchema = resolveSchema(schemaValue, spec);

    const xTags = (schemaValue as { 'x-tags'?: unknown })['x-tags'];
    const declaredTags = Array.isArray(xTags)
      ? (xTags as unknown[]).filter((t): t is string => typeof t === 'string')
      : [];
    const schemaTag = declaredTags.find((t) => schemaTagNameSet.has(t)) ?? defaultSchemaTag;
    schemaTagCounts.set(schemaTag, (schemaTagCounts.get(schemaTag) ?? 0) + 1);

    // The card header shows the description, so the nested schema drops it.
    const { description: _schemaDescription, ...schemaWithoutDescription } = resolvedSchema;

    const componentSchema: GenComponentSchema = {
      name: schemaName,
      ref: `#/components/schemas/${schemaName}`,
      type: resolvedSchema.type,
      schema: schemaWithoutDescription,
      schemaTag,
      tagsByKind: groupTagsByKind(declaredTags, tagKindMap),
    };

    if (schemaValue.description) componentSchema.description = schemaValue.description;
    // extendsRef is set by allOf merging.
    if (resolvedSchema.extendsRef) componentSchema.extendsRef = resolvedSchema.extendsRef;
    if (schemaValue.example !== undefined) componentSchema.example = schemaValue.example;

    componentSchemas.push(componentSchema);
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
