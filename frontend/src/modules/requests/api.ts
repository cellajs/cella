import { config } from 'config';
import { clientConfig, handleResponse } from '~/lib/api';
import { requestsHc } from '#/modules/requests/hc';

export const client = requestsHc(config.backendUrl, clientConfig);

export type CreateRequestBody = Parameters<(typeof client.index)['$post']>['0']['json'];

/**
 * Creates a new request for access or information.
 *
 * @param requestInfo - Request details.
 * @param requestInfo.type - Type of request `"waitlist" | "newsletter" | "contact"`.
 * @param requestInfo.email - Email address associated with the request.
 * @param requestInfo.message - Optional, message related to the request.
 * @returns A boolean indicating whether the request was successfully created.
 */
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

/**
 * Retrieves a paginated list of action requests.
 *
 * @param params - Query parameters.
 * @param params.q - Search query.
 * @param params.sort - Sort field (default: 'id').
 * @param params.order - Sort order `'asc' | 'desc'` (default: 'asc').
 * @param params.page - Page number (default: 0).
 * @param params.limit - Number of items per page (default: `config.requestLimits.requests`).
 * @param params.offset - offset.
 * @param signal - Optional AbortSignal to cancel the request.
 * @returns A list of requests.
 */
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

/**
 * Deletes multiple requests by their IDs.
 *
 * @param ids - An array of request IDs to delete.
 * @returns A boolean indicating whether the deletion was successful.
 */
export const deleteRequests = async (ids: string[]) => {
  const response = await client.index.$delete({
    json: { ids },
  });

  const json = await handleResponse(response);
  return json.success;
};
