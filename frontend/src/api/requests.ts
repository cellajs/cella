import type { RequestProp } from '~/types';
import { apiClient, handleResponse } from '.';

const client = apiClient.requests;

// Request access or request info
export const createRequest = async (requestInfo: RequestProp) => {
  const response = await client.$post({
    json: requestInfo,
  });

  await handleResponse(response);
};

export type GetRequestsParams = Partial<
  Omit<Parameters<(typeof client)['$get']>['0']['query'], 'limit' | 'offset'> & {
    limit?: number;
    offset?: number;
    page?: number;
  }
>;

export const getRequests = async ({ q, sort = 'id', order = 'asc', page = 0, limit = 50, offset }: GetRequestsParams = {}, signal?: AbortSignal) => {
  const response = await client.$get(
    {
      query: {
        q,
        sort,
        order,
        offset: typeof offset === 'number' ? String(offset) : String(page * limit),
        limit: String(limit),
      },
    },
    {
      fetch: (input: RequestInfo | URL, init?: RequestInit) => {
        return fetch(input, {
          ...init,
          credentials: 'include',
          signal,
        });
      },
    },
  );

  const json = await handleResponse(response);
  return json.data;
};
