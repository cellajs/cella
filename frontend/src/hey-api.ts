import { config } from 'config';
import { useAlertStore } from '~/store/alert';
import type { CreateClientConfig } from '~/ts-client/client.gen';

export const createClientConfig: CreateClientConfig = (passedConfig) => ({
  ...passedConfig,
  baseUrl: config.backendUrl,
  credentials: 'include',
  fetch: (input: RequestInfo | URL, init?: RequestInit) =>
    fetch(input, {
      ...init,
      credentials: 'include',
    }).catch((err) => {
      if (process.env.NODE_ENV === 'development' && err.message.includes('Failed to fetch')) {
        useAlertStore.getState().setDownAlert('backend_not_ready');
      }
      throw err; // Re-throw so caller can handle
    }),
});
