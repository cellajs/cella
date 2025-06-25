import { requestsHc } from '#/modules/requests/hc';
import { config } from 'config';
import { clientConfig, handleResponse } from '~/lib/api';

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

  return await handleResponse(response);
};

export type GetRequestsParams = Parameters<(typeof client.index)['$get']>['0']['query'];

/**
 * Retrieves a paginated list of action requests.
 *
 * @param params - Query parameters.
 * @param params.q - Search query.
 * @param params.sort - Sort field (default: 'id').
 * @param params.order - Sort order `'asc' | 'desc'` (default: 'asc').
 * @param params.limit - Number of items per page (default: `config.requestLimits.requests`).
 * @param params.offset - offset.
 * @param signal - Optional AbortSignal to cancel the request.
 * @returns A list of requests.
 */
export const getRequests = async (
  { q, sort, order, limit, offset }: GetRequestsParams,
  signal?: AbortSignal,
) => {
  const response = await client.index.$get(
    {
      query: {
        q,
        sort,
        order,
        offset,
        limit,
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

  return await handleResponse(response);
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

  return await handleResponse(response);
};
