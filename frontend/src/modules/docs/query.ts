import { queryOptions } from '@tanstack/react-query';
import { appConfig } from 'config';
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

/** OpenAPI spec URL in public/static */
export const openApiUrl = `${appConfig.frontendUrl}/static/openapi.json`;

/**
 * Query options for fetching the OpenAPI specification JSON.
 */
export const openApiSpecQueryOptions = queryOptions({
  queryKey: ['openapi-spec'],
  queryFn: async () => {
    const response = await fetch(openApiUrl);
    if (!response.ok) throw new Error(response.statusText);
    return response.json();
  },
  staleTime: Number.POSITIVE_INFINITY, // Static file, cache indefinitely
});

/**
 * Query options for fetching operations list (reduces bundle size).
 */
export const operationsQueryOptions = queryOptions({
  queryKey: ['docs', 'operations'],
  queryFn: async () => {
    const response = await fetch(`${docsBaseUrl}/operations.gen.json`);
    if (!response.ok) throw new Error(response.statusText);
    return response.json() as Promise<GenOperationSummary[]>;
  },
  staleTime: Number.POSITIVE_INFINITY,
});

/**
 * Query options for fetching tags list.
 */
export const tagsQueryOptions = queryOptions({
  queryKey: ['docs', 'tags'],
  queryFn: async () => {
    const response = await fetch(`${docsBaseUrl}/tags.gen.json`);
    if (!response.ok) throw new Error(response.statusText);
    return response.json() as Promise<GenTagSummary[]>;
  },
  staleTime: Number.POSITIVE_INFINITY,
});

/**
 * Query options for fetching OpenAPI info summary.
 */
export const infoQueryOptions = queryOptions({
  queryKey: ['docs', 'info'],
  queryFn: async () => {
    const response = await fetch(`${docsBaseUrl}/info.gen.json`);
    if (!response.ok) throw new Error(response.statusText);
    return response.json() as Promise<GenInfoSummary>;
  },
  staleTime: Number.POSITIVE_INFINITY,
});

/**
 * Query options for fetching schemas list.
 */
export const schemasQueryOptions = queryOptions({
  queryKey: ['docs', 'schemas'],
  queryFn: async () => {
    const response = await fetch(`${docsBaseUrl}/schemas.gen.json`);
    if (!response.ok) throw new Error(response.statusText);
    return response.json() as Promise<GenComponentSchema[]>;
  },
  staleTime: Number.POSITIVE_INFINITY,
});

/**
 * Query options for fetching schema tags list.
 */
export const schemaTagsQueryOptions = queryOptions({
  queryKey: ['docs', 'schema-tags'],
  queryFn: async () => {
    const response = await fetch(`${docsBaseUrl}/schema-tags.gen.json`);
    if (!response.ok) throw new Error(response.statusText);
    return response.json() as Promise<GenSchemaTagSummary[]>;
  },
  staleTime: Number.POSITIVE_INFINITY,
});

/**
 * Query options for fetching tag operation details.
 */
export const tagDetailsQueryOptions = (tagName: string) =>
  queryOptions({
    queryKey: ['docs', 'tag-details', tagName],
    queryFn: async () => {
      const response = await fetch(`${docsBaseUrl}/details.gen/${tagName}.gen.json`);
      if (!response.ok) throw new Error(response.statusText);
      return response.json() as Promise<GenOperationDetail[]>;
    },
    staleTime: Number.POSITIVE_INFINITY,
  });
