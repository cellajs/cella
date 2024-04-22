import type { Member } from '~/types';
import { ApiError, membershipClient as client } from '.';

export const removeMembersFromResource = async (query: { idOrSlug: string; ids: string[] }) => {
  const response = await client.memberships.$delete({ query });

  const json = await response.json();
  if ('error' in json) throw new ApiError(json.error);
  return json.data;
};

export const updateMembership = async (idOrSlug: string, id: string, role?: Member['organizationRole'], archive?: boolean, muted?: boolean) => {
  const response = await client.memberships[':id'].$put({
    param: {
      id,
    },
    json: { role, idOrSlug, inactive: archive, muted },
  });

  const json = await response.json();
  if ('error' in json) throw new ApiError(json.error);
  return json.data;
};
