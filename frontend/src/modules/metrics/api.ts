import { config } from 'config';
import { clientConfig, handleResponse } from '~/lib/api';
import { metricsHc } from '#/modules/metrics/hc';

// RPC
export const client = metricsHc(config.backendUrl, clientConfig);

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
