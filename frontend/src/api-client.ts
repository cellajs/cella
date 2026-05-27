import type { CreateClientConfig } from 'sdk/client.gen';
import { appConfig } from 'shared';
import { ApiError, clientConfig } from '~/lib/api';
import { checkConnectivity } from '~/query/offline/connectivity';

/**
 * Runtime client configuration for the API client after it generated.
 * The generated SDK output is in /sdk/gen/
 *
 * @link https://heyapi.dev/openapi-ts/get-started
 */
export const createClientConfig: CreateClientConfig = (baseConfig) => ({
  ...baseConfig,
  baseUrl: appConfig.backendUrl,
  responseStyle: 'data',
  throwOnError: true,
  fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
    let response: Response;

    try {
      response = await clientConfig.fetch(input, init);
    } catch (error) {
      // Network-level failure (no HTTP response) — probe actual connectivity
      if (error instanceof TypeError) checkConnectivity();
      throw error;
    }

    if (response.ok) return response;

    const json = await response.json();
    throw new ApiError(json);
  },
});
