import { infiniteQueryOptions } from '@tanstack/react-query';
import { config } from 'config';
import { type GetMembersParams, getMembers } from '~/api/memberships';
import { membersKeys } from '~/modules/common/query-client-provider/keys';
import { getPaginatedOffset } from '~/utils/mutate-query';

const LIMIT = config.requestLimits.members;

// Build query to get members with infinite scroll
export const membersQueryOptions = ({
  idOrSlug,
  orgIdOrSlug,
  entityType,
  q = '',
  sort: initialSort,
  order: initialOrder,
  role,
  limit = LIMIT,
}: GetMembersParams) => {
  const sort = initialSort || 'createdAt';
  const order = initialOrder || 'desc';
  const offset = getPaginatedOffset(membersKeys.list({ idOrSlug, entityType, orgIdOrSlug, q, sort, order, role }));

  return infiniteQueryOptions({
    queryKey: membersKeys.list({ idOrSlug, entityType, orgIdOrSlug, q, sort, order, role }),
    initialPageParam: 0,
    retry: 1,
    refetchOnWindowFocus: false,
    queryFn: async ({ pageParam: page, signal }) =>
      getMembers({ page, q, sort, order, role, limit, idOrSlug, orgIdOrSlug, entityType, offset }, signal),
    getNextPageParam: (_lastPage, allPages) => allPages.length,
  });
};
