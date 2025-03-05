import { type ContextEntity, config } from 'config';
import { clientConfig, handleResponse } from '~/lib/api';
import { membershipsHc } from '#/modules/memberships/hc';

export const client = membershipsHc(config.backendUrl, clientConfig);

export type InviteMemberProps = Parameters<(typeof client.index)['$post']>['0']['json'] &
  Parameters<(typeof client.index)['$post']>['0']['param'] & {
    idOrSlug: string;
    entityType: ContextEntity;
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

export type RemoveMembersProps = Parameters<(typeof client.index)['$delete']>['0']['param'] &
  Parameters<(typeof client.index)['$delete']>['0']['json'] & {
    idOrSlug: string;
    entityType: ContextEntity;
  };

/**
 * Delete multiple members from an entity.
 *
 * @param param.idOrSlug - ID or slug of the target entity.
 * @param param.entityType - Type of the target entity.
 * @param param.orgIdOrSlug - Organization ID or slug associated with the entity.
 * @param param.ids - Array of member IDs to delete.
 */
export const removeMembers = async ({ idOrSlug, entityType, ids, orgIdOrSlug }: RemoveMembersProps) => {
  const response = await client.index.$delete({
    param: { orgIdOrSlug },
    query: { idOrSlug, entityType },
    json: { ids },
  });

  await handleResponse(response);
};

export type UpdateMembershipProp = {
  idOrSlug: string;
  entityType: ContextEntity;
} & Parameters<(typeof client)[':id']['$put']>['0']['json'] &
  Parameters<(typeof client)[':id']['$put']>['0']['param'];

/**
 * Update an membership in entity
 *
 * @param values.id - ID of membership.
 * @param values.idOrSlug - ID or slug of target entity.
 * @param values.entityType - Type of target entity.
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
  entityType: ContextEntity;
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
 * @param param.limit - Maximum number of invited members per page (defaults to `config.requestLimits.memberInvitations`).
 * @param param.offset - Optional offset.
 * @param signal - Optional abort signal for cancelling the request.
 * @returns A paginated list of invited members.
 */
export const getMembershipInvitations = async (
  {
    idOrSlug,
    orgIdOrSlug,
    entityType,
    q,
    sort = 'createdAt',
    order = 'asc',
    page = 0,
    limit = config.requestLimits.memberInvitations,
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
