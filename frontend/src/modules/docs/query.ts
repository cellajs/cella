import { queryOptions } from '@tanstack/react-query';
import { appConfig } from 'config';

/** OpenAPI spec URL in public/static */
export const openApiUrl = `${appConfig.frontendUrl}/static/openapi.json`;

/** Query options for fetching the OpenAPI specification JSON. */
export const openApiSpecQueryOptions = queryOptions({
  queryKey: ['openapi-spec'],
  queryFn: async () => {
    const response = await fetch(openApiUrl);
    if (!response.ok) throw new Error(response.statusText);
    return response.json();
  },
  staleTime: Number.POSITIVE_INFINITY, // Static file, cache indefinitely
});
