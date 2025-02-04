import { infiniteQueryOptions, queryOptions, useMutation } from '@tanstack/react-query';
import { config } from 'config';

import type { ApiError } from '~/lib/api';
import { queryClient } from '~/lib/router';
import {
  type CreateOrganizationParams,
  type GetOrganizationsParams,
  type UpdateOrganizationBody,
  createOrganization,
  deleteOrganizations,
  getOrganization,
  getOrganizations,
  updateOrganization,
} from '~/modules/organizations/api';
import type { OrganizationWithMembership } from '~/modules/organizations/types';

export const organizationsKeys = {
  one: ['organization'] as const,
  single: (idOrSlug: string) => [...organizationsKeys.one, idOrSlug] as const,
  many: ['organizations'] as const,
  list: () => [...organizationsKeys.many, 'list'] as const,
  table: (filters?: GetOrganizationsParams) => [...organizationsKeys.list(), filters] as const,
  create: () => [...organizationsKeys.one, 'create'] as const,
  update: () => [...organizationsKeys.one, 'update'] as const,
  delete: () => [...organizationsKeys.one, 'delete'] as const,
};

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

export const useOrganizationCreateMutation = () => {
  return useMutation<OrganizationWithMembership, ApiError, CreateOrganizationParams>({
    mutationKey: organizationsKeys.create(),
    mutationFn: createOrganization,
  });
};

export const useOrganizationUpdateMutation = () => {
  return useMutation<OrganizationWithMembership, ApiError, { idOrSlug: string; json: UpdateOrganizationBody }>({
    mutationKey: organizationsKeys.update(),
    mutationFn: updateOrganization,
    onSuccess: (updatedOrganization, { idOrSlug }) => {
      queryClient.setQueryData(organizationsKeys.single(idOrSlug), updatedOrganization);
      queryClient.invalidateQueries({ queryKey: organizationsKeys.one });
    },
    gcTime: 1000 * 10,
  });
};

export const useOrganizationDeleteMutation = () => {
  return useMutation<void, ApiError, string[]>({
    mutationKey: organizationsKeys.delete(),
    mutationFn: deleteOrganizations,
  });
};
