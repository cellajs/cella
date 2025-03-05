import { config } from 'config';
import { clientConfig, handleResponse } from '~/lib/api';
import { usersHc } from '#/modules/users/hc';

export const client = usersHc(config.backendUrl, clientConfig);

export type GetUsersParams = Omit<Parameters<(typeof client.index)['$get']>['0']['query'], 'limit' | 'offset'> & {
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
  const response = await client[':idOrSlug'].$get({
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

export type UpdateUserParams = Parameters<(typeof client)[':idOrSlug']['$put']>['0']['json'];

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
  const response = await client[':idOrSlug'].$put({
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
  const response = await client.index.$delete({
    json: { ids: userIds },
  });

  await handleResponse(response);
};
