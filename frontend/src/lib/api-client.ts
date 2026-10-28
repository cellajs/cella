import type { CreateClientConfig } from 'sdk/client.gen';
import { appConfig } from 'shared';
import { currentSchemaVersion } from 'shared/schema-evolution';
import { apiErrorFromResponse, clientConfig } from '~/lib/api';
import { reportNetworkFailure, reportReachable } from '~/query/offline/connectivity';

/** What a load balancer or proxy answers while the API behind it is down or too slow. */
const gatewayStatuses = new Set([502, 503, 504]);

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
      if (error instanceof TypeError) void reportNetworkFailure();
      throw error;
    }
    // A gateway answering for an absent API proves nothing, as the probe also reads it.
    if (!gatewayStatuses.has(response.status)) reportReachable();

    if (response.ok) return response;
    throw await apiErrorFromResponse(response);
  },
});
