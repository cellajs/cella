import { config } from 'config';
import { clientConfig, handleResponse } from '~/lib/api';
import { requestsHc } from '#/modules/requests/hc';

// RPC
export const client = requestsHc(config.backendUrl, clientConfig);

export type CreateRequestBody = Parameters<(typeof client.index)['$post']>['0']['json'];

// Request access or request info
export const createRequest = async (requestInfo: CreateRequestBody) => {
  const response = await client.index.$post({
    json: requestInfo,
  });

  const json = await handleResponse(response);
  return json.success;
};

export type GetRequestsParams = Omit<Parameters<(typeof client.index)['$get']>['0']['query'], 'limit' | 'offset'> & {
  limit?: number;
  offset?: number;
  page?: number;
};

// Get all app action requests
export const getRequests = async (
  { q, sort = 'id', order = 'asc', page = 0, limit = config.requestLimits.requests, offset }: GetRequestsParams,
  signal?: AbortSignal,
) => {
  const response = await client.index.$get(
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

// delete requests
export const deleteRequests = async (ids: string[]) => {
  const response = await client.index.$delete({
    query: { ids },
  });

  const json = await handleResponse(response);
  return json.success;
};
