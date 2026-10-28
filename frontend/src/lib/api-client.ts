import type { CreateClientConfig } from 'sdk/client.gen';
import { appConfig } from 'shared';
import { currentSchemaVersion } from 'shared/schema-evolution';
import { apiErrorFromResponse, clientConfig } from '~/lib/api';
import { reportNetworkFailure, reportReachable } from '~/query/offline/connectivity';
import { isNetworkError } from '~/query/offline/network-retry';

/**
 * Runtime config for the generated API client (SDK output in /sdk/gen/).
 * @link https://heyapi.dev/openapi-ts/get-started
 */
export const createClientConfig: CreateClientConfig = (baseConfig) => ({
  ...baseConfig,
  baseUrl: appConfig.backendUrl,
  responseStyle: 'data',
  throwOnError: true,
  fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
    // Merge onto the existing Request headers: a fresh init would drop Content-Type.
    const version = String(currentSchemaVersion);
    let nextInput = input;
    let nextInit = init;
    if (input instanceof Request) {
      const headers = new Headers(input.headers);
      headers.set('x-client-version', version);
      nextInput = new Request(input, { headers });
    } else {
      const headers = new Headers(init?.headers);
      headers.set('x-client-version', version);
      nextInit = { ...init, headers };
    }
    let response: Response;

    try {
      response = await clientConfig.fetch(nextInput, nextInit);
    } catch (error) {
      // Network-level failure (no HTTP response), probe actual connectivity
      if (isNetworkError(error)) void reportNetworkFailure();
      throw error;
    }
    reportReachable();

    if (response.ok) return response;
    throw await apiErrorFromResponse(response);
  },
});
