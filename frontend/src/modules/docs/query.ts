import { queryOptions } from '@tanstack/react-query';
import { appConfig } from 'shared';
import type {
  GenComponentSchema,
  GenInfoSummary,
  GenOperationDetail,
  GenOperationSummary,
  GenSchemaTagSummary,
  GenTagSummary,
} from '~/modules/docs/types';

/** Base URL for docs JSON files in public/static/docs.gen (auto-generated) */
const docsBaseUrl = `${appConfig.frontendUrl}/static/docs.gen`;

/** Fetch JSON with Content-Type validation (guards against SPA HTML fallback responses). */
async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const contentType = response.headers.get('content-type');
  if (!contentType?.includes('application/json')) {
    throw new Error(`Expected JSON from ${url} but got ${contentType}`);
  }
  return response.json() as Promise<T>;
}

/** OpenAPI spec URL in public/static */
export const openApiUrl = `${appConfig.frontendUrl}/static/openapi.json`;

/**
 * Query keys for docs-related queries.
 */
const docsKeys = {
  all: ['docs'] as const,
  spec: ['openapi-spec'] as const,
  operations: ['docs', 'operations'] as const,
  operationTags: ['docs', 'operation-tags'] as const,
  info: ['docs', 'info'] as const,
  schemas: ['docs', 'schemas'] as const,
  schemaTags: ['docs', 'schema-tags'] as const,
  tagDetails: (tagName: string) => ['docs', 'tag-details', tagName] as const,
};

/**
 * Query options for fetching the OpenAPI specification JSON.
 */
export const openApiSpecQueryOptions = queryOptions({
  queryKey: docsKeys.spec,
  queryFn: () => fetchJson(openApiUrl),
  staleTime: Number.POSITIVE_INFINITY, // Static file, cache indefinitely
});

/** Group items by key(s). Supports single-key and multi-key (array) extractors. */
function groupBy<T>(items: T[], keyFn: (item: T) => string | string[]): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  for (const item of items) {
    const keys = keyFn(item);
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      (result[key] ??= []).push(item);
    }
  }
  return result;
}

/**
 * Query options for fetching operations list (reduces bundle size).
 */
export const operationsQueryOptions = queryOptions({
  queryKey: docsKeys.operations,
  queryFn: () => fetchJson<GenOperationSummary[]>(`${docsBaseUrl}/operations.gen.json`),
  staleTime: Number.POSITIVE_INFINITY,
});

/**
 * Operations pre-grouped by tag name. Shares cache with operationsQueryOptions.
 * Uses select to derive grouped data per-observer without extra fetches.
 */
export const operationsByTagQueryOptions = queryOptions({
  ...operationsQueryOptions,
  select: (ops: GenOperationSummary[]) => groupBy(ops, (op) => op.tags),
});

/**
 * Query options for fetching tags list.
 */
export const tagsQueryOptions = queryOptions({
  queryKey: docsKeys.operationTags,
  queryFn: () => fetchJson<GenTagSummary[]>(`${docsBaseUrl}/tags.gen.json`),
  staleTime: Number.POSITIVE_INFINITY,
});

/**
 * Query options for fetching OpenAPI info summary.
 */
export const infoQueryOptions = queryOptions({
  queryKey: docsKeys.info,
  queryFn: () => fetchJson<GenInfoSummary>(`${docsBaseUrl}/info.gen.json`),
  staleTime: Number.POSITIVE_INFINITY,
});

/**
 * Query options for fetching schemas list.
 */
export const schemasQueryOptions = queryOptions({
  queryKey: docsKeys.schemas,
  queryFn: () => fetchJson<GenComponentSchema[]>(`${docsBaseUrl}/schemas.gen.json`),
  staleTime: Number.POSITIVE_INFINITY,
});

/**
 * Schemas pre-grouped by schema tag. Shares cache with schemasQueryOptions.
 * Uses select to derive grouped data per-observer without extra fetches.
 */
export const schemasByTagQueryOptions = queryOptions({
  ...schemasQueryOptions,
  select: (schemas: GenComponentSchema[]) => groupBy(schemas, (s) => s.schemaTag),
});

/**
 * Query options for fetching schema tags list.
 */
export const schemaTagsQueryOptions = queryOptions({
  queryKey: docsKeys.schemaTags,
  queryFn: () => fetchJson<GenSchemaTagSummary[]>(`${docsBaseUrl}/schema-tags.gen.json`),
  staleTime: Number.POSITIVE_INFINITY,
});

/**
 * Query options for fetching tag operation details.
 */
export const tagDetailsQueryOptions = (tagName: string) =>
  queryOptions({
    queryKey: docsKeys.tagDetails(tagName),
    queryFn: () => fetchJson<GenOperationDetail[]>(`${docsBaseUrl}/details.gen/${tagName}.gen.json`),
    staleTime: Number.POSITIVE_INFINITY,
  });
