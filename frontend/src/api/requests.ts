import type { RequestType } from 'backend/db/schema/requests';
import { apiClient, handleResponse } from '.';

const client = apiClient.requests;

//TODO: infer from backend?
interface CreateRequestProp {
  email: string;
  type: RequestType;
  message?: string;
}

// Request access or request info
export const createRequest = async (requestInfo: CreateRequestProp) => {
  const response = await client.$post({
    json: {
      type: requestInfo.type,
      email: requestInfo.email,
      message: requestInfo.message || null,
    },
  });

  await handleResponse(response);
};

export type GetRequestsParams = Partial<
  Omit<Parameters<(typeof client)['$get']>['0']['query'], 'limit' | 'offset'> & {
    limit: number;
    page: number;
  }
>;

export const getRequests = async ({ q, sort = 'id', order = 'asc', page = 0, limit = 50 }: GetRequestsParams = {}, signal?: AbortSignal) => {
  const response = await client.$get(
    {
      query: {
        q,
        sort,
        order,
        offset: String(page * limit),
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
