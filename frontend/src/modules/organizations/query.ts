import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import { config } from 'config';

import { type GetOrganizationsParams, getOrgInvitesInfo, getOrganization, getOrganizations } from '~/modules/organizations/api';

export const organizationsKeys = {
  one: ['organization'] as const,
  invitedMembers: (idOrSlug: string) => [...organizationsKeys.one, 'invitedMembers', idOrSlug] as const,
  single: (idOrSlug: string) => [...organizationsKeys.one, idOrSlug] as const,
  updateSingle: (idOrSlug: string) => [...organizationsKeys.one, 'update', idOrSlug] as const,
  many: ['organizations'] as const,
  list: () => [...organizationsKeys.many, 'list'] as const,
  table: (filters?: GetOrganizationsParams) => [...organizationsKeys.list(), filters] as const,
};

export const organizationInvitesInfoQueryOptions = (idOrSlug: string) =>
  queryOptions({
    queryKey: organizationsKeys.invitedMembers(idOrSlug),
    queryFn: () => getOrgInvitesInfo(idOrSlug),
  });

export const organizationQueryOptions = (idOrSlug: string) =>
  queryOptions({
    queryKey: organizationsKeys.single(idOrSlug),
    queryFn: () => getOrganization(idOrSlug),
  });

export const organizationsQueryOptions = ({
  q = '',
  sort: initialSort,
  order: initialOrder,
  limit = config.requestLimits.organizations,
}: GetOrganizationsParams) => {
  const sort = initialSort || 'createdAt';
  const order = initialOrder || 'desc';

  const queryKey = organizationsKeys.table({ q, sort, order });

  return infiniteQueryOptions({
    queryKey,
    initialPageParam: 0,
    retry: 1,
    refetchOnWindowFocus: false,
    queryFn: async ({ pageParam: page, signal }) => await getOrganizations({ page, q, sort, order, limit, offset: page * limit }, signal),
    getNextPageParam: (_lastPage, allPages) => allPages.length,
  });
};
