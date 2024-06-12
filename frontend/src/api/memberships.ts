import type { ContextEntity, Member } from '~/types';
import { apiClient, handleResponse } from '.';

const client = apiClient.memberships;
export interface InviteMemberProps {
  emails: string[];
  role?: Member['role'];
  idOrSlug: string;
  organizationId: string;
  entityType: ContextEntity;
}

// Invite users
export const inviteMember = async ({ idOrSlug, entityType, organizationId, ...rest }: InviteMemberProps) => {
  const response = await client.$post({
    query: { idOrSlug, organizationId, entityType },
    json: rest,
  });

  await handleResponse(response);
};

export const removeMembers = async ({ idOrSlug, entityType, ids }: { idOrSlug: string; ids: string[]; entityType: ContextEntity }) => {
  const response = await client.$delete({
    query: { idOrSlug, entityType, ids },
  });

  await handleResponse(response);
};
export type UpdateMenuOptionsProp = { membershipId: string; role?: Member['role']; archive?: boolean; muted?: boolean };

export const updateMembership = async (values: UpdateMenuOptionsProp) => {
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
