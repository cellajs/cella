import type { Member } from '~/types';
import { membershipClient as client, handleResponse } from '.';

export const removeMembersFromResource = async ({ idOrSlug, ids }: { idOrSlug: string; ids: string[] }) => {
  const response = await client[':idOrSlug'].memberships.$delete({
    param: {
      idOrSlug,
    },
    query: { ids },
  });

  const json = await handleResponse(response);
  return json.data;
};

export const updateMembership = async (idOrSlug: string, user: string, role?: Member['organizationRole'], archive?: boolean, muted?: boolean) => {
  const response = await client[':idOrSlug'].memberships[':user'].$put({
    param: {
      idOrSlug,
      user,
    },
    json: { role, inactive: archive, muted },
  });

  const json = await handleResponse(response);
  return json.data;
};
