import { type ContextEntity, config } from 'config';
import { clientConfig, handleResponse } from '~/lib/api';
import { meHc } from '#/modules/me/hc';
import { usersHc } from '#/modules/users/hc';

// RPC
export const meClient = meHc(config.backendUrl, clientConfig);
export const userClient = usersHc(config.backendUrl, clientConfig);

// Get user by slug or ID
export const getUser = async (idOrSlug: string) => {
  const response = await userClient[':idOrSlug'].$get({
    param: { idOrSlug },
  });

  const json = await handleResponse(response);
  return json.data;
};

export type GetUsersParams = Omit<Parameters<(typeof userClient.index)['$get']>['0']['query'], 'limit' | 'offset'> & {
  limit?: number;
  offset?: number;
  page?: number;
};

// Get a list of users in system
export const getUsers = async (
  { q, sort = 'id', order = 'asc', page = 0, limit = config.requestLimits.users, role, offset }: GetUsersParams,
  signal?: AbortSignal,
) => {
  const response = await userClient.index.$get(
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
  const response = await userClient.index.$delete({
    json: { ids: userIds },
  });

  await handleResponse(response);
};

export type UpdateUserParams = Parameters<(typeof userClient)[':idOrSlug']['$put']>['0']['json'];

// Update user
export const updateUser = async (info: UpdateUserParams & { idOrSlug: string }) => {
  const { idOrSlug, ...body } = info;
  const response = await userClient[':idOrSlug'].$put({
    param: { idOrSlug },
    json: body,
  });

  const json = await handleResponse(response);
  return json.data;
};

// Get self
export const getSelf = async () => {
  const response = await meClient.index.$get();

  const json = await handleResponse(response);
  return json.data;
};

// Get self menu
export const getUserMenu = async () => {
  const response = await meClient.menu.$get();

  const json = await handleResponse(response);
  return json.data;
};

// Update self
export const updateSelf = async (params: Omit<UpdateUserParams, 'role'>) => {
  const response = await meClient.index.$put({
    json: params,
  });

  const json = await handleResponse(response);
  return json.data;
};

// Delete self
export const deleteSelf = async () => {
  const response = await meClient.index.$delete();
  await handleResponse(response);
};

// Terminate user sessions
export const deleteMySessions = async (sessionIds: string[]) => {
  const response = await meClient.sessions.$delete({
    json: { ids: sessionIds },
  });

  await handleResponse(response);
};

// Remove passkey
export const deletePasskey = async () => {
  const response = await meClient.passkey.$delete();

  const json = await handleResponse(response);
  return json.success;
};

export type LeaveEntityQuery = { idOrSlug: string; entityType: ContextEntity };
// Leave entity
export const leaveEntity = async (query: LeaveEntityQuery) => {
  const response = await meClient.leave.$delete({
    query,
  });

  const json = await handleResponse(response);
  return json.success;
};
