import { usersClient as client, handleResponse } from '.';

// Get user by slug or ID
export const getUserBySlugOrId = async (user: string) => {
  const response = await client[':user'].$get({
    param: { user },
  });

  const json = await handleResponse(response);
  return json.data;
};

export type GetUsersParams = Partial<
  Omit<Parameters<(typeof client.index)['$get']>['0']['query'], 'limit' | 'offset'> & {
    limit: number;
    page: number;
  }
>;

// Get a list of users in system
export const getUsers = async ({ q, sort = 'id', order = 'asc', page = 0, limit = 2, role }: GetUsersParams = {}, signal?: AbortSignal) => {
  const response = await client.index.$get(
    {
      query: {
        q,
        sort,
        order,
        role,
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

// Delete users from system
export const deleteUsers = async (userIds: string[]) => {
  const response = await client.index.$delete({
    query: { ids: userIds },
  });

  await handleResponse(response);
};

export type UpdateUserParams = Parameters<(typeof client)[':user']['$put']>['0']['json'];

// Update user
export const updateUser = async (user: string, params: UpdateUserParams) => {
  const response = await client[':user'].$put({
    param: { user },
    json: params,
  });

  const json = await handleResponse(response);
  return json.data;
};