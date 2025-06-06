import { type ContextEntityType, config } from 'config';
import { clientConfig, handleResponse } from '~/lib/api';
import type { Member } from '~/modules/memberships/types';
import { membershipsHc } from '#/modules/memberships/hc';

export const client = membershipsHc(config.backendUrl, clientConfig);

export type InviteMemberProps = Parameters<(typeof client.index)['$post']>['0']['json'] &
  Parameters<(typeof client.index)['$post']>['0']['param'] & {
    idOrSlug: string;
    entityType: ContextEntityType;
  };

/**
 * Invite users to a specified entity.
 *
 * @param param.idOrSlug - ID or slug of the target entity.
 * @param param.entityType - Type of the target entity.
 * @param param.orgIdOrSlug - Organization ID or slug associated with the entity.
 * @param param.role - Role to assign to the invited users `"admin" | "member"`.
 * @param param.emails - Array of email addresses to send invitations to.
 */
export const inviteMembers = async ({ idOrSlug, entityType, orgIdOrSlug, ...rest }: InviteMemberProps) => {
  const response = await client.index.$post({
    param: { orgIdOrSlug },
    query: { idOrSlug, entityType },
    json: rest,
  });

  await handleResponse(response);
};

export type RemoveMembersProps = Parameters<(typeof client.index)['$delete']>['0']['param'] & {
  idOrSlug: string;
  entityType: ContextEntityType;
  members: Member[];
};

/**
 * Delete multiple members from an entity.
 *
 * @param param.idOrSlug - ID or slug of the target entity.
 * @param param.entityType - Type of the target entity.
 * @param param.orgIdOrSlug - Organization ID or slug associated with the entity.
 * @param param.members - Array of members to delete.
 */
export const removeMembers = async ({ idOrSlug, entityType, members, orgIdOrSlug }: RemoveMembersProps) => {
  const response = await client.index.$delete({
    param: { orgIdOrSlug },
    query: { idOrSlug, entityType },
    json: { ids: members.map(({ id }) => id) },
  });

  await handleResponse(response);
};

export type UpdateMembershipProp = Parameters<(typeof client)[':id']['$put']>['0']['json'] & Parameters<(typeof client)[':id']['$put']>['0']['param'];

/**
 * Update an membership in entity
 *
 * @param values.id - ID of membership.
 * @param param.orgIdOrSlug - Organization ID or slug associated with the entity.
 * @param values.order - New order(for users menu).
 * @param values.role - New role of user for target entity.
 * @param values.archived - New archive state of target entity for user.
 * @param values.muted - New muted state of target entity for user.
 * @returns Updated membership
 */
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
  entityType: ContextEntityType;
};

type OptionalGetMembersParams = Omit<Parameters<(typeof client)['members']['$get']>['0']['query'], 'limit' | 'offset'> & {
  limit?: number;
  offset?: number;
  page?: number;
};

// Combined type
export type GetMembersParams = RequiredGetMembersParams & OptionalGetMembersParams;

/**
 * Get a list of members with pagination and filters
 *
 * @param param.idOrSlug - ID or slug of entity.
 * @param param.entityType - Type of entity.
 * @param param.orgIdOrSlug - Organization ID or slug associated with the entity.
 * @param param.q - Optional search query to filter results.
 * @param param.sort - Field to sort by (defaults to 'id').
 * @param param.order - Sort order `'asc' | 'desc'` (defaults to 'asc').
 * @param param.role - Optional Role `"admin" | "member"` to filter results.
 * @param param.page - Page number.
 * @param param.limit - Maximum number of members per page (defaults to `config.requestLimits.members`).
 * @param param.offset - Optional offset.
 * @param signal - Optional abort signal for cancelling the request.
 * @returns A paginated list of members.
 */
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

// Combined type
export type GetMembershipInvitationsParams = RequiredGetMembersParams &
  Omit<Parameters<(typeof client)['pending']['$get']>['0']['query'], 'limit' | 'offset'> & {
    limit?: number;
    offset?: number;
    page?: number;
  };

/**
 * Get a list of invited members in an entity with pagination and filters
 *
 * @param param.idOrSlug - ID or slug of entity.
 * @param param.entityType - Type of entity.
 * @param param.orgIdOrSlug - Organization ID or slug associated with the entity.
 * @param param.q - Optional search query to filter results.
 * @param param.sort - Field to sort by (defaults to 'id').
 * @param param.order - Sort order `'asc' | 'desc'` (defaults to 'asc').
 * @param param.role - Optional Role `"admin" | "member"` to filter results.
 * @param param.page - Page number.
 * @param param.limit - Maximum number of invited members per page (defaults to `config.requestLimits.pendingInvitations`).
 * @param param.offset - Optional offset.
 * @param signal - Optional abort signal for cancelling the request.
 * @returns A paginated list of invited members.
 */
export const getPendingInvitations = async (
  {
    idOrSlug,
    orgIdOrSlug,
    entityType,
    q,
    sort = 'createdAt',
    order = 'asc',
    page = 0,
    limit = config.requestLimits.pendingInvitations,
    offset,
  }: GetMembershipInvitationsParams,
  signal?: AbortSignal,
) => {
  const response = await client.pending.$get(
    {
      query: {
        idOrSlug,
        entityType,
        q,
        sort,
        order,
        offset: typeof offset === 'number' ? String(offset) : String(page * limit),
        limit: String(limit),
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
