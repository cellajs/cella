import { infiniteQueryOptions } from '@tanstack/react-query';
import { config } from 'config';

import { type GetMembersParams, type GetMembershipInvitationsParams, getMembers, getMembershipInvitations } from '~/modules/memberships/api';
import { getOffset } from '~/query/helpers';

/**
 * Keys for members related queries. These keys help to uniquely identify different query.
 * For managing query caching and invalidation.
 */
export const membersKeys = {
  all: ['members'] as const,
  table: {
    base: () => [...membersKeys.all, 'table'] as const,
    members: (filters: GetMembersParams) => [...membersKeys.table.base(), filters] as const,
    similarMembers: (filters: Pick<GetMembersParams, 'orgIdOrSlug' | 'idOrSlug' | 'entityType'>) => [...membersKeys.table.base(), filters] as const,
    pending: (filters: GetMembershipInvitationsParams) => ['invites', ...membersKeys.table.base(), filters] as const,
  },
  update: () => [...membersKeys.all, 'update'] as const,
  delete: () => [...membersKeys.all, 'delete'] as const,
};

/**
 * Infinite query options to fetch a paginated list of members.
 *
 * This function returns the configuration needed to query a list of members from target entity with pagination.
 *
 * @param param.idOrSlug - ID or slug of entity.
 * @param param.entityType - Type of entity.
 * @param param.orgIdOrSlug - ID or slug of organization based of witch entity created.
 * @param param.q - Optional search query to filter members by (default is an empty string).
 * @param param.role - Role of the members to filter by.
 * @param param.sort - Field to sort by (default is 'createdAt').
 * @param param.order - Order of sorting (default is 'desc').
 * @param param.limit - Number of items per page (default is configured in `config.requestLimits.members`).
 * @returns Infinite query options.
 */
export const membersQueryOptions = ({
  idOrSlug,
  orgIdOrSlug,
  entityType,
  q = '',
  sort: initialSort,
  order: initialOrder,
  role,
  limit = config.requestLimits.members,
}: GetMembersParams) => {
  const sort = initialSort || 'createdAt';
  const order = initialOrder || 'desc';

  const queryKey = membersKeys.table.members({ idOrSlug, entityType, orgIdOrSlug, q, sort, order, role });

  return infiniteQueryOptions({
    queryKey,
    initialPageParam: 0,
    queryFn: async ({ pageParam: page, signal }) => {
      const offset = getOffset(queryKey); // Calculate before fetching ensuring correct offset
      return await getMembers({ page, q, sort, order, role, limit, idOrSlug, orgIdOrSlug, entityType, offset }, signal);
    },
    getNextPageParam: (_lastPage, allPages) => allPages.length,
  });
};

/**
 * Infinite query options to fetch a paginated list of invited members.
 *
 * This function returns the configuration needed to query a list of members from target entity with pagination.
 *
 * @param param.idOrSlug - ID or slug of entity.
 * @param param.entityType - Type of entity.
 * @param param.orgIdOrSlug - ID or slug of organization based of witch entity created.
 * @param param.q - Optional search query to filter invited members by (default is an empty string).
 * @param param.sort - Field to sort by (default is 'createdAt').
 * @param param.order - Order of sorting (default is 'desc').
 * @param param.limit - Number of items per page (default is configured in `config.requestLimits.memberInvitations`).
 * @returns Infinite query options.
 */
export const memberInvitationsQueryOptions = ({
  idOrSlug,
  orgIdOrSlug,
  entityType,
  q = '',
  sort: initialSort,
  order: initialOrder,
  limit = config.requestLimits.memberInvitations,
}: GetMembershipInvitationsParams) => {
  const sort = initialSort || 'createdAt';
  const order = initialOrder || 'desc';

  const queryKey = membersKeys.table.pending({ idOrSlug, entityType, orgIdOrSlug, q, sort, order });

  return infiniteQueryOptions({
    queryKey,
    initialPageParam: 0,
    queryFn: async ({ pageParam: page, signal }) => {
      const offset = getOffset(queryKey); // Calculate before fetching ensuring correct offset
      return await getMembershipInvitations({ page, q, sort, order, limit, idOrSlug, orgIdOrSlug, entityType, offset }, signal);
    },
    getNextPageParam: (_lastPage, allPages) => allPages.length,
  });
};
