import type { Member } from '~/types';
import { membershipClient as client, handleResponse } from '.';

export const removeMembersFromResource = async ({ idOrSlug, entityType, ids }: { idOrSlug: string; ids: string[], entityType: 'ORGANIZATION' | 'WORKSPACE' | 'PROJECT' }) => {
  const response = await client.memberships.$delete({
    query: {idOrSlug, entityType, ids, },
  });

  const json = await handleResponse(response);
  return json.data;
};

export const updateMembership = async (membershipId: string, role?: Member['organizationRole'], archive?: boolean, muted?: boolean) => {
  const response = await client.memberships[':membership'].$put({
    param: {
      membership: membershipId,
    },
    json: { role, inactive: archive, muted },
  });

  const json = await handleResponse(response);
  return json.data;
};
