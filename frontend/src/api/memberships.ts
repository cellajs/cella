import type { Member } from '~/types';
import { membershipClient as client, handleResponse } from '.';

export interface InviteMemberProps {
  emails: string[];
  role?: Member['organizationRole'];
  idOrSlug: string;
}

// Invite users
export const inviteMember = async ({ idOrSlug, ...rest }: InviteMemberProps) => {
  const response = await client.membership.$post({
    query: { idOrSlug },
    json: rest,
  });

  await handleResponse(response);
};

export const removeMembersFromResource = async ({
  idOrSlug,
  entityType,
  ids,
}: { idOrSlug: string; ids: string[]; entityType: 'ORGANIZATION' | 'WORKSPACE' | 'PROJECT' }) => {
  const response = await client.memberships.$delete({
    query: { idOrSlug, entityType, ids },
  });

  const json = await handleResponse(response);
  return json.data;
};
export type UpdateMenuOptionsProp = { membershipId: string; role?: Member['organizationRole']; archive?: boolean; muted?: boolean };

export const updateMembership = async (values: UpdateMenuOptionsProp) => {
  const { membershipId, role, archive, muted } = values;
  const response = await client.memberships[':membership'].$put({
    param: {
      membership: membershipId,
    },
    json: { role, inactive: archive, muted },
  });

  const json = await handleResponse(response);
  return json.data;
};
