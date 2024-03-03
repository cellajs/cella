import { ApiError, client } from '.';

// Get public counts for about page
export const getPublicCounts = async () => {
  const response = await client.public.counts.$get();

  const json = await response.json();
  if ('error' in json) throw new ApiError(response.status, json.error);
  return json.data;
};
