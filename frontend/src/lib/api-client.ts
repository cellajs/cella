import type { CreateClientConfig } from 'sdk/client.gen';
import { appConfig } from 'shared';
import { currentSchemaVersion } from 'shared/schema-evolution';
import { ApiError, clientConfig } from '~/lib/api';
import { checkConnectivity } from '~/query/offline/connectivity';

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
    // Tag each request with the client schema version. hey-api passes a Request as the sole arg,
    // so merge onto its existing headers. A fresh init drops Content-Type.
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
      if (error instanceof TypeError) checkConnectivity();
      throw error;
    }

    if (response.ok) return response;

    const json = await response.json();
    throw new ApiError(json);
  },
});
