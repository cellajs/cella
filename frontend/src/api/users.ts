import { config } from 'config';
import { usersHc } from '#/modules/users/hc';
import { clientConfig, handleResponse } from '.';

// Create Hono clients to make requests to the backend
export const client = usersHc(config.backendUrl, clientConfig);

// Get user by slug or ID
export const getUser = async (idOrSlug: string) => {
  const response = await client[':idOrSlug'].$get({
    param: { idOrSlug },
  });

  const json = await handleResponse(response);
  return json.data;
};

export type GetUsersParams = Omit<Parameters<(typeof client.index)['$get']>['0']['query'], 'limit' | 'offset'> & {
  limit?: number;
  offset?: number;
  page?: number;
};

// Get a list of users in system
export const getUsers = async ({ q, sort = 'id', order = 'asc', page = 0, limit = 2, role, offset }: GetUsersParams, signal?: AbortSignal) => {
  const response = await client.index.$get(
    {
      query: {
        q,
        sort,
        order,
        role,
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

// Delete users from system
export const deleteUsers = async (userIds: string[]) => {
  const response = await client.index.$delete({
    query: { ids: userIds },
  });

  await handleResponse(response);
};

export type UpdateUserParams = Parameters<(typeof client)[':idOrSlug']['$put']>['0']['json'];

// Update user
export const updateUser = async (idOrSlug: string, params: UpdateUserParams) => {
  const response = await client[':idOrSlug'].$put({
    param: { idOrSlug },
    json: params,
  });

  const json = await handleResponse(response);
  return json.data;
};
