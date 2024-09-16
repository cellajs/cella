import type { AppMetricType } from 'backend/modules/metrics/index';
import { config } from 'config';
import { hc } from 'hono/client';
import { clientConfig, handleResponse } from '.';

// Create Hono clients to make requests to the backend
export const client = hc<AppMetricType>(`${config.backendUrl}/metrics`, clientConfig);

// Get public counts for about page
export const getPublicCounts = async () => {
  const response = await client.public.$get();

  const json = await handleResponse(response);
  return json.data;
};

// Get metrics
export const getMetrics = async () => {
  const response = await client.index.$get();
  const json = await handleResponse(response);
  return json.data;
};
