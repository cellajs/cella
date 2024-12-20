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
  orgIdOrSlug: string;
  entityType: ContextEntity;
}

// Invite users
export const inviteMembers = async ({ idOrSlug, entityType, orgIdOrSlug, ...rest }: InviteMemberProps) => {
  const response = await client.index.$post({
    param: { orgIdOrSlug },
    query: { idOrSlug, entityType },
    json: rest,
  });

  await handleResponse(response);
};

export type RemoveMembersProps = {
  orgIdOrSlug: string;
  idOrSlug: string;
  entityType: ContextEntity;
  ids: string[];
};

export const removeMembers = async ({ idOrSlug, entityType, ids, orgIdOrSlug }: RemoveMembersProps) => {
  const response = await client.index.$delete({
    param: { orgIdOrSlug },
    query: { idOrSlug, entityType, ids },
  });

  await handleResponse(response);
};

export type UpdateMembershipProp = {
  idOrSlug: string;
  entityType: ContextEntity;
  orgIdOrSlug: string;
  id: string;
} & Parameters<(typeof client)[':id']['$put']>['0']['json'];

// Update membership in entity
export const updateMembership = async (values: UpdateMembershipProp) => {
  const { id, role, archived, muted, order, orgIdOrSlug } = values;
  const response = await client[':id'].$put({
    param: {
      orgIdOrSlug,
      id,
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
  {
    idOrSlug,
    orgIdOrSlug,
    entityType,
    q,
    sort = 'id',
    order = 'asc',
    role,
    page = 0,
    limit = config.requestLimits.members,
    offset,
  }: GetMembersParams,
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
