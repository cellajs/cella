import { config } from "config";
import { CreateClientConfig } from "./src/openapi-client/client.gen";


export const createClientConfig: CreateClientConfig = (baseConfig) => ({
  ...baseConfig,
  baseUrl: config.backendUrl,
  responseStyle: 'data',
  throwOnError: true,
  fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, {...init, credentials: 'include' })
});