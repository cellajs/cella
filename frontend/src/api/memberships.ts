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
    param: { orgIdOrSlug: organizationId },
    query: { idOrSlug, entityType },
    json: rest,
  });

  await handleResponse(response);
};

interface RemoveMembersProps {
  idOrSlug: string;
  ids: string[];
  entityType: ContextEntity;
  organizationId: string;
}

export const removeMembers = async ({ idOrSlug, entityType, ids, organizationId }: RemoveMembersProps) => {
  const response = await client.index.$delete({
    param: { orgIdOrSlug: organizationId },
    query: { idOrSlug, entityType, ids },
  });

  await handleResponse(response);
};
export type UpdateMenuOptionsProp = {
  membershipId: string;
  organizationId: string;
  role?: Membership['role'];
  archived?: boolean;
  muted?: boolean;
  order?: number;
};

// Update membership in entity
export const updateMembership = async (values: UpdateMenuOptionsProp) => {
  const { membershipId, role, archived, muted, order, organizationId } = values;
  const response = await client[':id'].$put({
    param: {
      orgIdOrSlug: organizationId,
      id: membershipId,
    },
    json: { role, archived, muted, order },
  });

  const json = await handleResponse(response);
  return json.data;
};
