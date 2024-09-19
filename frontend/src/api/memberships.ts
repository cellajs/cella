import { config } from 'config';
import type { ContextEntity, Membership } from '~/types/common';
import { membershipsHc } from '#/modules/memberships/hc';
import { clientConfig, handleResponse } from '.';

// Create Hono clients to make requests to the backend
export const client = membershipsHc(config.backendUrl, clientConfig);

export interface InviteMemberProps {
  emails: string[];
  role: Membership['role'];
  idOrSlug: string;
  organizationId: string;
  entityType: ContextEntity;
}

// Invite users
export const inviteMembers = async ({ idOrSlug, entityType, organizationId, ...rest }: InviteMemberProps) => {
  const response = await client.index.$post({
    query: { idOrSlug, organizationId, entityType },
    json: rest,
  });

  await handleResponse(response);
};

export const removeMembers = async ({ idOrSlug, entityType, ids }: { idOrSlug: string; ids: string[]; entityType: ContextEntity }) => {
  const response = await client.index.$delete({
    query: { idOrSlug, entityType, ids },
  });

  await handleResponse(response);
};
export type UpdateMenuOptionsProp = { membershipId: string; role?: Membership['role']; archived?: boolean; muted?: boolean; order?: number };

// Update membership in entity
export const updateMembership = async (values: UpdateMenuOptionsProp) => {
  const { membershipId, role, archived, muted, order } = values;
  const response = await client[':id'].$put({
    param: {
      id: membershipId,
    },
    json: { role, archived, muted, order },
  });

  const json = await handleResponse(response);
  return json.data;
};
