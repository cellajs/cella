import { ApiError, client } from '.';

// Get the current user
export const getMe = async () => {
  const response = await client.me.$get();

  const json = await response.json();
  if ('error' in json) throw new ApiError(response.status, json.error);
  return json.data;
};

// Get the current user menu
export const getUserMenu = async () => {
  const response = await client.menu.$get();

  const json = await response.json();
  if ('error' in json) throw new ApiError(response.status, json.error);
  return json.data;
};

export type GetUsersParams = Partial<
  Omit<Parameters<(typeof client.users)['$get']>['0']['query'], 'limit' | 'offset'> & {
    limit: number;
    page: number;
  }
>;

// Get a list of users in the system
export const getUsers = async ({ q, sort = 'id', order = 'asc', page = 0, limit = 50, role }: GetUsersParams = {}, signal?: AbortSignal) => {
  const response = await client.users.$get(
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

  const json = await response.json();
  if ('error' in json) throw new ApiError(response.status, json.error);
  return json.data;
};

// Delete a users from the system
export const deleteUsers = async (userIds: string[]) => {
  const response = await client.users.$delete({
    query: { ids: userIds },
  });

  const json = await response.json();
  if ('error' in json) throw new ApiError(response.status, json.error);
  return;
};

// Get a user by their slug or ID
export const getUserBySlugOrId = async (userIdentifier: string) => {
  const response = await client.users[':userId'].$get({
    param: { userId: userIdentifier },
  });

  const json = await response.json();
  if ('error' in json) throw new ApiError(response.status, json.error);
  return json.data;
};

export type UpdateUserParams = Parameters<(typeof client.users)[':userId']['$put']>['0']['json'];

// Update a user
export const updateUser = async (userId: string, params: UpdateUserParams) => {
  const response = await client.users[':userId'].$put({
    param: { userId },
    json: params,
  });

  const json = await response.json();
  if ('error' in json) throw new ApiError(response.status, json.error);
  return json.data;
};

// Search for users in the system
export const searchUsers = async (query: string) => {
  const response = await client.users.$get({
    query: {
      q: query,
      sort: 'id',
      order: 'asc',
      offset: '0',
      limit: '50',
    },
  });

  const json = await response.json();
  if ('error' in json) throw new ApiError(response.status, json.error);
  return json.data;
};
