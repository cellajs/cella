import { config } from 'config';
import { usersHc } from '#/modules/users/hc';
import { clientConfig, handleResponse } from '~/lib/api';

export const client = usersHc(config.backendUrl, clientConfig);

export type GetUsersParams = Parameters<(typeof client.index)['$get']>['0']['query'];

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

export const getUsers = async (
  { q, sort, order, limit, role, offset }: GetUsersParams,
  signal?: AbortSignal,
) => {
  const response = await client.index.$get(
    {
      query: {
        q,
        sort,
        order,
        role,
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
