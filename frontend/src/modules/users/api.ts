import { type ContextEntity, config } from 'config';
import { clientConfig, handleResponse } from '~/lib/api';
import { meHc } from '#/modules/me/hc';
import { usersHc } from '#/modules/users/hc';

export const meClient = meHc(config.backendUrl, clientConfig);
export const userClient = usersHc(config.backendUrl, clientConfig);

export type GetUsersParams = Omit<Parameters<(typeof userClient.index)['$get']>['0']['query'], 'limit' | 'offset'> & {
  limit?: number;
  offset?: number;
  page?: number;
};

/**
 * Get a user by slug or ID.
 *
 * @param idOrSlug - ID or slug of user to retrieve.
 * @returns User's data.
 */
export const getUser = async (idOrSlug: string) => {
  const response = await userClient[':idOrSlug'].$get({
    param: { idOrSlug },
  });

  const json = await handleResponse(response);
  return json.data;
};

/**
 * Get a list of users with optional filters and pagination.
 *
 * @param param.q - Search query for filtering users(default is an empty string).
 * @param param.role - Optional Role `"admin" | "member"` to filter results.
 * @param param.sort - Field to sort by (default is 'id').
 * @param param.order - Order of sorting (default is 'asc').
 * @param param.limit - Number of items per page (default: `config.requestLimits.users`).
 * @param param.page - Page number.
 * @param param.offset - Optional offset.
 * @param signal - Optional abort signal for cancelling the request.
 * @returns The list of users matching the search query and filters.
 */
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

export type UpdateUserParams = Parameters<(typeof userClient)[':idOrSlug']['$put']>['0']['json'];

/**
 * Update user details by ID or slug.
 *
 *  @param info.idOrSlug - Target user ID or slug.
 *  @param info.slug - Optional, URL-friendly string.
 *  @param info.firstName - Optional, first name.
 *  @param info.lastName -Optional, last name.
 *  @param info.language - Optional, preferred language.
 *  @param info.bannerUrl -  Optional, URL for banner image.
 *  @param info.thumbnailUrl - Optional, URL for thumbnail image.
 *  @param info.newsletter - Optional, subscription to the newsletter.
 *  @returns The updated user data.
 */
export const updateUser = async (info: UpdateUserParams & { idOrSlug: string }) => {
  const { idOrSlug, ...body } = info;
  const response = await userClient[':idOrSlug'].$put({
    param: { idOrSlug },
    json: body,
  });

  const json = await handleResponse(response);
  return json.data;
};

/**
 * Delete multiple users from the system.
 *
 * @param userIds - An array of user IDs to delete.
 */
export const deleteUsers = async (userIds: string[]) => {
  const response = await userClient.index.$delete({
    json: { ids: userIds },
  });

  await handleResponse(response);
};

/**
 * Get the current user's details. Retrieves information about the currently authenticated user.
 *
 * @returns The user's data.
 */
export const getSelf = async () => {
  const response = await meClient.index.$get();

  const json = await handleResponse(response);
  return json.data;
};

/**
 * Get the current user auth details. Retrieves data like sessions, passkey and OAuth.
 *
 * @returns Current user auth data.
 */
export const getSelfAuthInfo = async () => {
  const response = await meClient.auth.$get();

  const json = await handleResponse(response);
  return json.data;
};

/**
 * Get current user menu. Retrieves menu associated with currently authenticated user.
 *
 * @returns The user menu data.
 */
export const getUserMenu = async () => {
  const response = await meClient.menu.$get();

  const json = await handleResponse(response);
  return json.data;
};

/**
 * Update current user details. Updates currently authenticated user information.
 *
 * TODO: too detailed, consider sharing schema or type
 *  @param params.email - Optional, email address.
 *  @param params.slug - Optional, URL-friendly string.
 *  @param params.firstName - Optional, first name.
 *  @param params.lastName -Optional, last name.
 *  @param params.language - Optional, preferred language.
 *  @param params.bannerUrl -  Optional, URL for banner image.
 *  @param params.thumbnailUrl - Optional, URL for thumbnail image.
 *  @param params.newsletter - Optional, subscription to the newsletter.
 *  @returns The updated user data.
 */
export const updateSelf = async (params: Omit<UpdateUserParams, 'role'>) => {
  const response = await meClient.index.$put({
    json: params,
  });

  const json = await handleResponse(response);
  return json.data;
};

/**
 * Delete current user.
 */
export const deleteSelf = async () => {
  const response = await meClient.index.$delete();
  await handleResponse(response);
};

/**
 * Terminate user sessions by their IDs.
 *
 * @param sessionIds - An array of session IDs to terminate.
 */
export const deleteMySessions = async (sessionIds: string[]) => {
  const response = await meClient.sessions.$delete({
    json: { ids: sessionIds },
  });

  await handleResponse(response);
};

/**
 * Remove passkey associated with the currently authenticated user.
 *
 * @returns A boolean indicating whether the passkey was successfully removed.
 */
export const deletePasskey = async () => {
  const response = await meClient.passkey.$delete();

  const json = await handleResponse(response);
  return json.success;
};

export type LeaveEntityQuery = { idOrSlug: string; entityType: ContextEntity };

/**
 * Remove the current user from a specified entity.
 *
 * @param query.idOrSlug - ID or slug of the entity to leave.
 * @param query.entityType - Type of entity to leave.
 * @returns A boolean indicating whether the user successfully left the entity.
 */
export const leaveEntity = async (query: LeaveEntityQuery) => {
  const response = await meClient.leave.$delete({
    query,
  });

  const json = await handleResponse(response);
  return json.success;
};
