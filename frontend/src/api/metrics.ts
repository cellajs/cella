import { apiClient, handleResponse } from '.';

// Create Hono clients to make requests to the backend
export const client = apiClient.metrics;

// Get public counts for about page
export const getPublicCounts = async () => {
  const response = await client.public.$get();

  const json = await handleResponse(response);
  return json.data;
};

// Get metrics
export const getMetrics = async () => {
  const response = await client.$get();
  const json = await handleResponse(response);
  return json.data;
};
