import { queryOptions, useSuspenseQueries } from '@tanstack/react-query';
import type { GenComponentSchema, GenInfoSummary, GenOperationDetail, GenOperationSummary, GenSchemaTagSummary, GenTagSummary } from 'sdk/docs-types';
import { appConfig } from 'shared';
import { buildIndex } from '~/modules/docs/helpers/extract-types';
import { queryClient } from '~/query/query-client';

/** Append the build SHA to a /static URL, so browser and service worker caches roll over per release. */
const versionedUrl = (url: string) => `${url}?v=${__APP_VERSION__}`;

/** Base URL for docs JSON files served at /static/docs.gen (generated into sdk/gen, copied by Vite) */
const docsBaseUrl = `${appConfig.frontendUrl}/static/docs.gen`;

/** Fetch JSON with Content-Type validation (guards against SPA HTML fallback responses). */
async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(versionedUrl(url));
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const contentType = response.headers.get('content-type');
  if (!contentType?.includes('application/json')) {
    throw new Error(`Expected JSON from ${url} but got ${contentType}`);
  }
  return response.json() as Promise<T>;
}

const openApiPath = `${appConfig.frontendUrl}/static/openapi.json`;

export const openApiUrl = versionedUrl(openApiPath);

const docsKeys = {
  spec: ['openapi-spec'] as const,
  operations: ['docs', 'operations'] as const,
  operationTags: ['docs', 'operation-tags'] as const,
  info: ['docs', 'info'] as const,
  schemas: ['docs', 'schemas'] as const,
  schemaTags: ['docs', 'schema-tags'] as const,
  tagDetails: (tagName: string) => ['docs', 'tag-details', tagName] as const,
  zodIndex: ['docs', 'zod-index'] as const,
  typesIndex: ['docs', 'types-index'] as const,
};

export const openApiSpecQueryOptions = queryOptions({
  queryKey: docsKeys.spec,
  queryFn: () => fetchJson(openApiPath),
  staleTime: 'static',
});

/** Group items by key(s). Supports single-key and multi-key (array) extractors. */
function groupBy<T>(items: T[], getKeys: (item: T) => string | string[]): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  for (const item of items) {
    const keys = getKeys(item);
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      result[key] ??= [];
      result[key].push(item);
    }
  }
  return result;
}

export const operationsQueryOptions = queryOptions({
  queryKey: docsKeys.operations,
  queryFn: () => fetchJson<GenOperationSummary[]>(`${docsBaseUrl}/operations.gen.json`),
  staleTime: 'static',
});

/** Operations grouped by tag name, derived per observer from the operationsQueryOptions cache. */
export const operationsByTagQueryOptions = queryOptions({
  ...operationsQueryOptions,
  select: (ops: GenOperationSummary[]) => groupBy(ops, (op) => op.tags),
});

export const tagsQueryOptions = queryOptions({
  queryKey: docsKeys.operationTags,
  queryFn: () => fetchJson<GenTagSummary[]>(`${docsBaseUrl}/tags.gen.json`),
  staleTime: 'static',
});

/** Tags that hold operations, derived per observer from the tagsQueryOptions cache. */
export const nonEmptyTagsQueryOptions = queryOptions({
  ...tagsQueryOptions,
  select: (tags: GenTagSummary[]) => tags.filter((tag) => tag.count > 0),
});

export const infoQueryOptions = queryOptions({
  queryKey: docsKeys.info,
  queryFn: () => fetchJson<GenInfoSummary>(`${docsBaseUrl}/info.gen.json`),
  staleTime: 'static',
});

export const schemasQueryOptions = queryOptions({
  queryKey: docsKeys.schemas,
  queryFn: () => fetchJson<GenComponentSchema[]>(`${docsBaseUrl}/schemas.gen.json`),
  staleTime: 'static',
});

/** Schemas grouped by schema tag, derived per observer from the schemasQueryOptions cache. */
export const schemasByTagQueryOptions = queryOptions({
  ...schemasQueryOptions,
  select: (schemas: GenComponentSchema[]) => groupBy(schemas, (schema) => schema.schemaTag),
});

export const schemaTagsQueryOptions = queryOptions({
  queryKey: docsKeys.schemaTags,
  queryFn: () => fetchJson<GenSchemaTagSummary[]>(`${docsBaseUrl}/schema-tags.gen.json`),
  staleTime: 'static',
});

export const tagDetailsQueryOptions = (tagName: string) =>
  queryOptions({
    queryKey: docsKeys.tagDetails(tagName),
    queryFn: () => (tagName ? fetchJson<GenOperationDetail[]>(`${docsBaseUrl}/details.gen/${tagName}.gen.json`) : ([] as GenOperationDetail[])),
    staleTime: 'static',
  });

/** Loads a tag's details before its section opens; a failure stays silent, and the section's own query fetches again. */
export const prefetchTagDetails = (tagName: string) => {
  void queryClient.query(tagDetailsQueryOptions(tagName)).catch(() => {});
};

/** Every exported definition of a generated sdk source file, by export name. */
const definitionIndexQueryOptions = (queryKey: readonly string[], file: string) =>
  queryOptions({
    queryKey,
    queryFn: async () => {
      const response = await fetch(versionedUrl(`${appConfig.frontendUrl}/static/${file}`));
      return buildIndex(await response.text());
    },
    staleTime: 'static',
  });

const zodIndexQueryOptions = definitionIndexQueryOptions(docsKeys.zodIndex, 'zod.gen.ts');
const typesIndexQueryOptions = definitionIndexQueryOptions(docsKeys.typesIndex, 'types.gen.ts');

/** Both definition indexes, fetched in parallel: two `useSuspenseQuery` calls would start the second only once the first resolved. */
export function useDefinitionIndexes() {
  const [{ data: zodIndex }, { data: typesIndex }] = useSuspenseQueries({ queries: [zodIndexQueryOptions, typesIndexQueryOptions] });
  return { zodIndex, typesIndex };
}
