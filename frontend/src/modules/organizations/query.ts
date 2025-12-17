import { infiniteQueryOptions, queryOptions, useMutation } from '@tanstack/react-query';
import { appConfig } from 'config';
import {
  type CreateOrganizationData,
  createOrganization,
  deleteOrganizations,
  type GetOrganizationsData,
  getOrganization,
  getOrganizations,
  type Organization,
  type UpdateOrganizationData,
  updateOrganization,
} from '~/api.gen';
import type { ApiError } from '~/lib/api';
import { addMenuItem, deleteMenuItem, updateMenuItem } from '~/modules/navigation/menu-sheet/helpers/menu-operations';
import type { OrganizationWithMembership } from '~/modules/organizations/types';
import { useMutateQueryData } from '~/query/hooks/use-mutate-query-data';
import { baseInfiniteQueryOptions } from '~/query/utils/infinite-query-options';

/**
 * Keys for organizations related queries. These keys help to uniquely identify different query.
 * For managing query caching and invalidation.
 */
export const keys = {
  all: ['organizations'],
  table: {
    base: ['organizations', 'table'],
    entries: (filters: Omit<GetOrganizationsData['query'], 'limit' | 'offset'>) => [...keys.table.base, filters],
  },
  single: {
    base: ['organization'],
    byIdOrSlug: (idOrSlug: string) => [...keys.single.base, idOrSlug],
  },
  create: ['organizations', 'create'],
  update: ['organizations', 'update'],
  delete: ['organizations', 'delete'],
};

export const organizationsKeys = keys;

/**
 * Query options for a single organization by id or slug.
 * This function returns query options for fetching a single organization using its id or slug.
 */
export const organizationQueryOptions = (idOrSlug: string) =>
  queryOptions({
    queryKey: organizationsKeys.single.byIdOrSlug(idOrSlug),
    queryFn: async () => getOrganization({ path: { idOrSlug } }),
  });

/**
 * Query options to get a paginated list of organizations.
 * This function returns infinite query options to fetch a list of organizations with support for pagination.
 */
export const organizationsQueryOptions = ({
  q = '',
  sort = 'createdAt',
  order = 'desc',
  userId,
  includeArchived,
  role,
  limit: baseLimit = appConfig.requestLimits.organizations,
}: Omit<NonNullable<GetOrganizationsData['query']>, 'limit' | 'offset'> & { limit?: number }) => {
  const limit = String(baseLimit);

  const queryKey = organizationsKeys.table.entries({ q, sort, order, userId, includeArchived, role });

  return infiniteQueryOptions({
    queryKey,
    queryFn: async ({ pageParam: { page, offset: _offset }, signal }) => {
      const offset = String(_offset || (page || 0) * Number(limit));
      return await getOrganizations({ query: { q, sort, order, limit, offset, userId, includeArchived, role }, signal });
    },
    ...baseInfiniteQueryOptions,
  });
};

/**
 * Custom hook to create a new organization.
 * This hook provides the functionality to create a new organization.
 *
 * @returns The mutation hook for creating an organization.
 */
export const useOrganizationCreateMutation = () => {
  return useMutation<OrganizationWithMembership, ApiError, CreateOrganizationData['body']>({
    mutationKey: organizationsKeys.create,
    mutationFn: (body) => createOrganization({ body }),
    onSuccess: (createdOrganization) => {
      const mutateCache = useMutateQueryData(organizationsKeys.table.base);

      mutateCache.create([createdOrganization]);
      addMenuItem(createdOrganization);
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
  return useMutation<Organization, ApiError, { idOrSlug: string; body: UpdateOrganizationData['body'] }>({
    mutationKey: organizationsKeys.update,
    mutationFn: ({ idOrSlug, body }) => updateOrganization({ body, path: { idOrSlug } }),
    onSuccess: (updatedOrganization) => {
      // Update menuItem in store, only if it has membership is not null
      if (updatedOrganization.membership) updateMenuItem({ ...updatedOrganization, membership: updatedOrganization.membership });

      const mutateCache = useMutateQueryData(organizationsKeys.table.base, () => organizationsKeys.single.base, ['update']);

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
    mutationKey: organizationsKeys.delete,
    mutationFn: async (organizations) => {
      const ids = organizations.map(({ id }) => id);
      await deleteOrganizations({ body: { ids } });
    },
    onSuccess: (_, organizations) => {
      const mutateCache = useMutateQueryData(organizationsKeys.table.base, () => organizationsKeys.single.base, ['remove']);

      mutateCache.remove(organizations);
      for (const { id } of organizations) deleteMenuItem(id);
    },
  });
};
