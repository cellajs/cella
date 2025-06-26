import { config } from "config";
import { ApiError, clientConfig } from "~/lib/api";
import { CreateClientConfig } from "~/openapi-client/client.gen";


export const createClientConfig: CreateClientConfig = (baseConfig) => ({
  ...baseConfig,
  baseUrl: config.backendUrl,
  responseStyle: 'data',
  throwOnError: true,
  fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await clientConfig.fetch(input, init)
    
    if (response.ok) return response; 
    
    const json = await response.json();
    throw new ApiError(json);
  }
});