import { infiniteQueryOptions, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { appConfig } from 'config';
import {
  type CreateOrganizationsData,
  createOrganizations,
  deleteOrganizations,
  type GetOrganizationsData,
  getOrganization,
  getOrganizations,
  type Organization,
  type UpdateOrganizationData,
  updateOrganization,
} from '~/api.gen';
import type { ApiError } from '~/lib/api';
import type { OrganizationWithMembership } from '~/modules/organization/types';
import {
  baseInfiniteQueryOptions,
  createEntityKeys,
  findInListCache,
  invalidateIfLastMutation,
  registerEntityQueryKeys,
  useMutateQueryData,
} from '~/query/basic';

type OrganizationFilters = Omit<GetOrganizationsData['query'], 'limit' | 'offset'>;

const keys = createEntityKeys<OrganizationFilters>('organization');

// Register query keys for dynamic lookup in stream handlers
registerEntityQueryKeys('organization', keys);

/**
 * Organization query keys.
 */
export const organizationQueryKeys = keys;

/** Find an organization in the list cache by id or slug. */
export const findOrganizationInListCache = (idOrSlug: string) =>
  findInListCache<Organization>(keys.list.base, (org) => org.id === idOrSlug || org.slug === idOrSlug);

/**
 * Query options for a single organization by ID.
 * NOTE: Slug is only used on page load. All subsequent queries must use ID.
 */
export const organizationQueryOptions = (id: string) =>
  queryOptions({
    queryKey: keys.detail.byId(id),
    queryFn: async () => getOrganization({ path: { idOrSlug: id } }),
    placeholderData: () => findOrganizationInListCache(id),
  });

type OrganizationsListParams = Omit<NonNullable<GetOrganizationsData['query']>, 'limit' | 'offset'> & {
  limit?: number;
};

/**
 * Infinite query options to get a paginated list of organizations.
 * Note: `include` is NOT part of the cache key - queries with/without counts share the same cache
 * for seamless offline behavior. The most recent fetch determines what's cached.
 */
export const organizationsListQueryOptions = (params: OrganizationsListParams) => {
  const {
    q = '',
    sort = 'createdAt',
    order = 'desc',
    userId,
    excludeArchived,
    role,
    include,
    limit: baseLimit = appConfig.requestLimits.organizations,
  } = params;

  const limit = String(baseLimit);

  // Exclude `include` from cache key so queries with/without counts share the same cache
  const keyFilters = { q, sort, order, userId, excludeArchived, role };

  const queryKey = keys.list.filtered(keyFilters);
  const baseQuery = { ...keyFilters, include, limit };

  return infiniteQueryOptions({
    queryKey,
    queryFn: async ({ pageParam: { page, offset: _offset }, signal }) => {
      const offset = String(_offset ?? (page ?? 0) * Number(limit));

      return getOrganizations({
        query: { ...baseQuery, offset },
        signal,
      });
    },
    ...baseInfiniteQueryOptions,
    refetchOnMount: true,
  });
};

/**
 * Mutation hook for creating a new organization.
 */
export const useOrganizationCreateMutation = () => {
  const queryClient = useQueryClient();
  const mutateCache = useMutateQueryData(keys.list.base);

  return useMutation<OrganizationWithMembership, ApiError, CreateOrganizationsData['body']>({
    mutationKey: keys.create,
    mutationFn: async (body) => {
      const result = await createOrganizations({ body });
      // Return the first created organization (currently only single creation supported)
      return result.data[0] as OrganizationWithMembership;
    },
    onSuccess: (createdOrganization) => {
      mutateCache.create([createdOrganization]);
    },
    onSettled: () => {
      invalidateIfLastMutation(queryClient, keys.all, keys.list.base);
    },
  });
};

/**
 * Mutation hook for updating an existing organization.
 */
export const useOrganizationUpdateMutation = () => {
  const queryClient = useQueryClient();
  const mutateCache = useMutateQueryData(keys.list.base, () => keys.detail.base, ['update']);

  return useMutation<Organization, ApiError, { id: string; body: UpdateOrganizationData['body'] }>({
    mutationKey: keys.update,
    mutationFn: ({ id, body }) => updateOrganization({ body, path: { id } }),
    onSuccess: (updatedOrganization) => {
      mutateCache.update([updatedOrganization]);
    },
    onSettled: () => {
      invalidateIfLastMutation(queryClient, keys.all, keys.list.base);
    },
  });
};

/**
 * Mutation hook for deleting organizations.
 */
export const useOrganizationDeleteMutation = () => {
  const queryClient = useQueryClient();
  const mutateCache = useMutateQueryData(keys.list.base, (org) => keys.detail.byId(org.id), ['remove']);

  return useMutation<void, ApiError, Organization[]>({
    mutationKey: keys.delete,
    mutationFn: async (organizations) => {
      const ids = organizations.map(({ id }) => id);
      await deleteOrganizations({ body: { ids } });
    },
    onSuccess: (_, organizations) => {
      mutateCache.remove(organizations);
    },
    onSettled: () => {
      invalidateIfLastMutation(queryClient, keys.all, keys.list.base);
    },
  });
};
