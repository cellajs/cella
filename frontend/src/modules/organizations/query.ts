import { infiniteQueryOptions, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
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
import type { OrganizationWithMembership } from '~/modules/organizations/types';
import {
  baseInfiniteQueryOptions,
  createEntityKeys,
  findInListCache,
  invalidateIfLastMutation,
  useMutateQueryData,
} from '~/query/basic';

type OrganizationFilters = Omit<GetOrganizationsData['query'], 'limit' | 'offset'>;

const keys = createEntityKeys<OrganizationFilters>('organization');

/**
 * Organization query keys.
 */
export const organizationQueryKeys = keys;

/** Find an organization in the list cache by id or slug. */
export const findOrganizationInListCache = (idOrSlug: string) =>
  findInListCache<Organization>(keys.list.base, (org) => org.id === idOrSlug || org.slug === idOrSlug);

/**
 * Query options for a single organization by id or slug.
 * Uses initialData from the organizations list cache (e.g., menu data) to provide
 * instant loading while revalidating in the background.
 */
export const organizationQueryOptions = (idOrSlug: string) =>
  queryOptions({
    queryKey: keys.detail.byId(idOrSlug),
    queryFn: async () => getOrganization({ path: { idOrSlug } }),
    // Seed from list cache (e.g., organizations loaded for menu) for instant display
    initialData: () => findOrganizationInListCache(idOrSlug),
    // Treat list data as fresh for 30 seconds to avoid unnecessary refetches
    staleTime: 30_000,
  });

type OrganizationsListParams = Omit<NonNullable<GetOrganizationsData['query']>, 'limit' | 'offset'> & {
  limit?: number;
};

/**
 * Infinite query options to get a paginated list of organizations.
 * Note: `include` is NOT part of the cache key - queries with/without counts share the same cache
 * for seamless offline behavior. The most recent fetch determines what's cached.
 */
export const organizationsQueryOptions = (params: OrganizationsListParams) => {
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
  });
};

/**
 * Mutation hook for creating a new organization.
 */
export const useOrganizationCreateMutation = () => {
  const queryClient = useQueryClient();
  const mutateCache = useMutateQueryData(keys.list.base);

  return useMutation<OrganizationWithMembership, ApiError, CreateOrganizationData['body']>({
    mutationKey: keys.create,
    mutationFn: (body) => createOrganization({ body }),
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

  return useMutation<Organization, ApiError, { idOrSlug: string; body: UpdateOrganizationData['body'] }>({
    mutationKey: keys.update,
    mutationFn: ({ idOrSlug, body }) => updateOrganization({ body, path: { idOrSlug } }),
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
  const mutateCache = useMutateQueryData(keys.list.base, () => keys.detail.base, ['remove']);

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
