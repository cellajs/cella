import type { CreateClientConfig } from 'sdk/client.gen';
import { appConfig } from 'shared';
import { currentSchemaVersion } from 'shared/version-changes';
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
    // Schema-evolution telemetry header (Phase 1: telemetry-only fleet floor).
    // One place covers the whole generated SDK. See info/SCHEMA_EVOLUTION.md.
    const headers = new Headers(init?.headers);
    headers.set('x-client-version', String(currentSchemaVersion));
    const requestInit: RequestInit = { ...init, headers };

    let response: Response;

    try {
      response = await clientConfig.fetch(input, requestInit);
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
