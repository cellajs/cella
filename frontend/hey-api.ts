import { config } from "config";
import { ApiError } from "~/lib/api";
import { CreateClientConfig } from "~/openapi-client/client.gen";


export const createClientConfig: CreateClientConfig = (baseConfig) => ({
  ...baseConfig,
  baseUrl: config.backendUrl,
  responseStyle: 'data',
  throwOnError: true,
  fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await fetch(input, { ...(init ?? {}), credentials: 'include' });
    
    if (response.ok) return response; 
    
    const json = await response.json();

    if ('error' in json) throw new ApiError(json.error);

    throw new Error('Unknown error');
  }
});