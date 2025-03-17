import { infiniteQueryOptions, queryOptions, useMutation } from '@tanstack/react-query';
import { config } from 'config';

import type { ApiError } from '~/lib/api';
import { addMenuItem, deleteMenuItem } from '~/modules/navigation/menu-sheet/helpers/menu-operations';
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
import type { Organization, OrganizationWithMembership } from '~/modules/organizations/types';
import { getOffset } from '~/query/helpers';
import { useMutateQueryData } from '~/query/hooks/use-mutate-query-data';

/**
 * Keys for organizations related queries. These keys help to uniquely identify different query.
 * For managing query caching and invalidation.
 */
export const organizationsKeys = {
  one: ['organization'] as const,
  many: ['organizations'] as const,
  list: () => [...organizationsKeys.many, 'list'] as const,
  table: (filters?: GetOrganizationsParams) => [...organizationsKeys.list(), filters] as const,
  singleBase: () => [...organizationsKeys.one, 'single'] as const,
  single: (idOrSlug: string) => [...organizationsKeys.singleBase(), idOrSlug] as const,
  create: () => [...organizationsKeys.one, 'create'] as const,
  update: () => [...organizationsKeys.one, 'update'] as const,
  delete: () => [...organizationsKeys.one, 'delete'] as const,
};

/**
 * Query options for a single organization by id or slug.
 *
 * This function returns query options for fetching a single organization using its id or slug.
 *
 * @param idOrSlug - Organization id or slug.
 * @returns Query options.
 */
export const organizationQueryOptions = (idOrSlug: string) =>
  queryOptions({
    queryKey: organizationsKeys.single(idOrSlug),
    queryFn: () => getOrganization(idOrSlug),
  });

/**
 * Query options to get a paginated list of organizations.
 *
 * This function returns infinite query options to fetch a list of organizations with support for pagination.
 *
 * @param param.q - Search query for filtering organizations(default is an empty string).
 * @param param.sort - Field to sort by (default is 'createdAt').
 * @param param.order - Order of sorting (default is 'desc').
 * @param param.limit - Number of items per page (default: `config.requestLimits.organizations`).
 * @returns Infinite query options.
 */
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
    queryFn: async ({ pageParam: page, signal }) => {
      const offset = getOffset(queryKey); // Calculate before fetching ensuring correct offset
      return await getOrganizations({ page, q, sort, order, limit, offset }, signal);
    },
    getNextPageParam: (_lastPage, allPages) => allPages.length,
  });
};

/**
 * Custom hook to create a new organization.
 * This hook provides the functionality to create a new organization.
 *
 * @returns The mutation hook for creating an organization.
 */
export const useOrganizationCreateMutation = () => {
  return useMutation<OrganizationWithMembership, ApiError, CreateOrganizationParams>({
    mutationKey: organizationsKeys.create(),
    mutationFn: createOrganization,
    onSuccess: (createdOrganization) => {
      const mutateCache = useMutateQueryData(organizationsKeys.list());

      mutateCache.create([createdOrganization]);
      addMenuItem(createdOrganization, 'organizations');
    },
  });
};

/**
 * Custom hook to update an existing organization.
 * This hook provides the functionality to update an organization. After a successful update,
 * it updates the local cache and invalidates relevant queries to keep the data fresh.
 *
 * @returns The mutation hook for updating an organization.
 */
export const useOrganizationUpdateMutation = () => {
  return useMutation<Organization, ApiError, { idOrSlug: string; json: UpdateOrganizationBody }>({
    mutationKey: organizationsKeys.update(),
    mutationFn: updateOrganization,
    onSuccess: (updatedOrganization) => {
      const mutateCache = useMutateQueryData(organizationsKeys.list(), () => organizationsKeys.singleBase(), ['update']);

      mutateCache.update([updatedOrganization]);
    },
  });
};

/**
 * Custom hook to delete organizations.
 * This hook provides the functionality to delete one or more organizations.
 *
 * @returns The mutation hook for deleting organizations.
 */
export const useOrganizationDeleteMutation = () => {
  return useMutation<void, ApiError, Organization[]>({
    mutationKey: organizationsKeys.delete(),
    mutationFn: (organizations) => deleteOrganizations(organizations.map(({ id }) => id)),
    onSuccess: (_, organizations) => {
      const mutateCache = useMutateQueryData(organizationsKeys.list(), () => organizationsKeys.singleBase(), ['remove']);

      mutateCache.remove(organizations);
      for (const { id } of organizations) deleteMenuItem(id);
    },
  });
};
