import { config } from 'config';
import { clientConfig, handleResponse } from '~/lib/api';
import { metricsHc } from '#/modules/metrics/hc';

export const client = metricsHc(config.backendUrl, clientConfig);

/**
 * Get public counts data for marketing page.
 *
 * @returns The data from the response containing:
 *   - `users` (number): The number of registered users.
 *   - `attachments` (number): The number of created attachments.
 *   - `organizations` (number): The number of created organizations.
 */
export const getPublicCounts = async () => {
  const response = await client.public.$get();

  const json = await handleResponse(response);
  return json.data;
};

/**
 * Get metrics and related data.
 *
 * @returns The data from the response, which is an array of objects containing:
 *   - `date` (string): The date the metric was recorded.
 *   - `count` (number): The associated count for that date.
 */
export const getMetrics = async () => {
  const response = await client.index.$get();
  const json = await handleResponse(response);
  return json.data;
};
