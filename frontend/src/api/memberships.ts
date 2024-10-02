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

type RequiredGetMembersParams = {
  idOrSlug: string;
  orgIdOrSlug: string;
  entityType: ContextEntity;
};

type OptionalGetMembersParams = Omit<Parameters<(typeof client)['members']['$get']>['0']['query'], 'limit' | 'offset'> & {
  limit?: number;
  offset?: number;
  page?: number;
};

// Combined type
export type GetMembersParams = RequiredGetMembersParams & OptionalGetMembersParams;

// Get a list of members in an entity
export const getMembers = async (
  { idOrSlug, orgIdOrSlug, entityType, q, sort = 'id', order = 'asc', role, page = 0, limit = 50, offset }: GetMembersParams,
  signal?: AbortSignal,
) => {
  const response = await client.members.$get(
    {
      query: {
        idOrSlug,
        entityType,
        q,
        sort,
        order,
        offset: typeof offset === 'number' ? String(offset) : String(page * limit),
        limit: String(limit),
        role,
      },
      param: { orgIdOrSlug },
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
