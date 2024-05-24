import { publicClient as client, handleResponse } from '.';

// Get public counts for about page
export const getPublicCounts = async () => {
  const response = await client.public.counts.$get();

  const json = await handleResponse(response);
  return json.data;
};
