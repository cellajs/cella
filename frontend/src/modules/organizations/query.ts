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
import type { OrganizationWithMembership } from '~/modules/organizations/types';
import { useMutateQueryData } from '~/query/hooks/use-mutate-query-data';
import { baseInfiniteQueryOptions } from '~/query/utils/infinite-query-options';
import { createEntityKeys } from '../entities/create-query-keys';

type OrganizationFilters = Omit<GetOrganizationsData['query'], 'limit' | 'offset'>;

const keys = createEntityKeys<OrganizationFilters>('organization');

export const organizationQueryKeys = keys;

/**
 * Query options for a single organization by id or slug.
 * This function returns query options for fetching a single organization using its id or slug.
 */
export const organizationQueryOptions = (idOrSlug: string) =>
  queryOptions({
    queryKey: keys.detail.byIdOrSlug(idOrSlug),
    queryFn: async () => getOrganization({ path: { idOrSlug } }),
  });

type OrganizationsListParams = Omit<NonNullable<GetOrganizationsData['query']>, 'limit' | 'offset'> & { limit?: number };

/**
 * Query options to get a paginated list of organizations.
 * This function returns infinite query options to fetch a list of organizations with support for pagination.
 */
export const organizationsQueryOptions = (params: OrganizationsListParams) => {
  const {
    q = '',
    sort = 'createdAt',
    order = 'desc',
    userId,
    excludeArchived,
    role,
    limit: baseLimit = appConfig.requestLimits.organizations,
  } = params;

  const limit = String(baseLimit);

  const keyFilters = { q, sort, order, userId, excludeArchived, role };

  const queryKey = keys.list.filtered(keyFilters);
  const baseQuery = { ...keyFilters, limit };

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
 * Custom hook to create a new organization.
 * This hook provides the functionality to create a new organization.
 *
 * @returns The mutation hook for creating an organization.
 */
export const useOrganizationCreateMutation = () => {
  return useMutation<OrganizationWithMembership, ApiError, CreateOrganizationData['body']>({
    mutationKey: keys.create,
    mutationFn: (body) => createOrganization({ body }),
    onSuccess: (createdOrganization) => {
      const mutateCache = useMutateQueryData(keys.list.base);

      mutateCache.create([createdOrganization]);
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
    mutationKey: keys.update,
    mutationFn: ({ idOrSlug, body }) => updateOrganization({ body, path: { idOrSlug } }),
    onSuccess: (updatedOrganization) => {
      const mutateCache = useMutateQueryData(keys.list.base, () => keys.detail.base, ['update']);
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
    mutationKey: keys.delete,
    mutationFn: async (organizations) => {
      const ids = organizations.map(({ id }) => id);
      await deleteOrganizations({ body: { ids } });
    },
    onSuccess: (_, organizations) => {
      const mutateCache = useMutateQueryData(keys.list.base, () => keys.detail.base, ['remove']);

      mutateCache.remove(organizations);
    },
  });
};
