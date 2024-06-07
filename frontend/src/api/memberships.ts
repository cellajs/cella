import type { ContextEntity, Member } from '~/types';
import { membershipsClient as client, handleResponse } from '.';

export interface InviteMemberProps {
  emails: string[];
  role?: Member['role'];
  idOrSlug: string;
}

// Invite users
export const inviteMember = async ({ idOrSlug, ...rest }: InviteMemberProps) => {
  const response = await client.index.$post({
    query: { idOrSlug },
    json: rest,
  });

  await handleResponse(response);
};

export const removeMembers = async ({ idOrSlug, entityType, ids }: { idOrSlug: string; ids: string[]; entityType: ContextEntity }) => {
  const response = await client.index.$delete({
    query: { idOrSlug, entityType, ids },
  });

  const json = await handleResponse(response);
  return json.data;
};
export type UpdateMenuOptionsProp = { membershipId: string; role?: Member['role']; archive?: boolean; muted?: boolean };

export const updateMembership = async (values: UpdateMenuOptionsProp) => {
  console.log('values:', values);
  console.log('values:', values);
  const { membershipId, role, archive, muted } = values;
  const response = await client[':id'].$put({
    param: {
      id: membershipId,
    },
    json: { role, inactive: archive, muted },
  });

  const json = await handleResponse(response);
  return json.data;
};
