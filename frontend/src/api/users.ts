import { ApiError, usersClient as client } from '.';

// Get the current user
export const getMe = async () => {
  const response = await client.me.$get();

  const json = await response.json();
  if ('error' in json) throw new ApiError(json.error);
  return json.data;
};

// Get the current user menu
export const getUserMenu = async () => {
  const response = await client.menu.$get();

  const json = await response.json();
  if ('error' in json) throw new ApiError(json.error);
  return json.data;
};

// Get a user by slug or ID
export const getUserBySlugOrId = async (user: string) => {
  const response = await client.users[':user'].$get({
    param: { user },
  });

  const json = await response.json();
  if ('error' in json) throw new ApiError(json.error);
  return json.data;
};

export type GetUsersParams = Partial<
  Omit<Parameters<(typeof client.users)['$get']>['0']['query'], 'limit' | 'offset'> & {
    limit: number;
    page: number;
  }
>;

// Get a list of users in the system
export const getUsers = async ({ q, sort = 'id', order = 'asc', page = 0, limit = 2, role }: GetUsersParams = {}, signal?: AbortSignal) => {
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
  if ('error' in json) throw new ApiError(json.error);
  return json.data;
};

// Delete a users from the system
export const deleteUsers = async (userIds: string[]) => {
  const response = await client.users.$delete({
    query: { ids: userIds },
  });

  const json = await response.json();
  if ('error' in json) throw new ApiError(json.error);
  return;
};

export type UpdateUserParams = Parameters<(typeof client.users)[':user']['$put']>['0']['json'];

// Update a user
export const updateUser = async (user: string, params: UpdateUserParams) => {
  const response = await client.users[':user'].$put({
    param: { user },
    json: params,
  });

  const json = await response.json();
  if ('error' in json) throw new ApiError(json.error);
  return json.data;
};

// Terminate a user sessions
export const terminateMySessions = async (sessionIds: string[]) => {
  const response = await client.me.sessions.$delete({
    query: { ids: sessionIds },
  });

  const json = await response.json();
  if ('error' in json) throw new ApiError(json.error);
  return;
};
