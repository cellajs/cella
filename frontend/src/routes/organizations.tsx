import { infiniteQueryOptions } from '@tanstack/react-query';
import { createRoute, useParams } from '@tanstack/react-router';
import type { ErrorType } from 'backend/lib/errors';
import { getMembersQuerySchema } from 'backend/modules/general/schema';
import { lazy, Suspense } from 'react';
import type { z } from 'zod';
import { type GetMembersParams, getMembers } from '~/api/general';
import { queryClient } from '~/lib/router';
import { noDirectAccess } from '~/lib/utils';
import ErrorNotice from '~/modules/common/error-notice';
import Organization, { organizationQueryOptions } from '~/modules/organizations/organization';
import OrganizationSettings from '~/modules/organizations/organization-settings';
import { IndexRoute } from './routeTree';
import { useNavigationStore } from '~/store/navigation';

//Lazy-loaded components
const MembersTable = lazy(() => import('~/modules/organizations/members-table'));

const membersSearchSchema = getMembersQuerySchema.pick({ q: true, sort: true, order: true, role: true });

export const membersQueryOptions = ({ idOrSlug, entityType, q, sort: initialSort, order: initialOrder, role, limit }: GetMembersParams) => {
  const sort = initialSort || 'createdAt';
  const order = initialOrder || 'desc';

  return infiniteQueryOptions({
    queryKey: ['members', idOrSlug, entityType, q, sort, order, role],
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }) => {
      const fetchedData = await getMembers(
        {
          page: pageParam,
          q,
          sort,
          order,
          role,
          limit,
          idOrSlug,
          entityType: 'ORGANIZATION',
        },
        signal,
      );
      return fetchedData;
    },
    getNextPageParam: (_lastPage, allPages) => allPages.length,
    refetchOnWindowFocus: false,
  });
};

export type MembersSearchType = z.infer<typeof getMembersQuerySchema>;

export const OrganizationRoute = createRoute({
  path: '$idOrSlug',
  staticData: { pageTitle: 'Organization' },
  beforeLoad: ({ location, params }) => noDirectAccess(location.pathname, params.idOrSlug, '/members'),
  getParentRoute: () => IndexRoute,
  loader: async ({ params: { idOrSlug } }) => {
    const organization = await queryClient.ensureQueryData(organizationQueryOptions(idOrSlug));
    return { organization };
  },
  errorComponent: ({ error }) => <ErrorNotice error={error as ErrorType} />,
  component: () => (
    <Suspense>
      <Organization />
    </Suspense>
  ),
});

export const OrganizationMembersRoute = createRoute({
  path: '/members',
  staticData: { pageTitle: 'Members' },
  getParentRoute: () => OrganizationRoute,
  loaderDeps: ({ search: { q, sort, order, role } }) => ({ q, sort, order, role }),
  loader: async ({ params: { idOrSlug }, deps: { q, sort, order, role } }) => {
    const entityType = 'ORGANIZATION';
    const membersInfiniteQueryOptions = membersQueryOptions({ idOrSlug, entityType, q, sort, order, role });
    const cachedMembers = queryClient.getQueryData(membersInfiniteQueryOptions.queryKey);
    if (!cachedMembers) {
      queryClient.fetchInfiniteQuery(membersInfiniteQueryOptions);
    }
  },
  component: () => {
    const { idOrSlug } = useParams({ from: OrganizationMembersRoute.id });
    const { menu } = useNavigationStore();
    const [userRole] = Object.values(menu)
      .map((el) => {
        const targetEntity = el.find((el) => el.id === idOrSlug || el.slug === idOrSlug);
        if (targetEntity) return targetEntity.membership.role;
      })
      .filter((el) => el !== undefined);
    return (
      <Suspense>
        <MembersTable entityType="ORGANIZATION" isAdmin={userRole === 'ADMIN'} />
      </Suspense>
    );
  },
  validateSearch: membersSearchSchema,
});

export const OrganizationSettingsRoute = createRoute({
  path: '/settings',
  staticData: { pageTitle: 'Settings' },
  getParentRoute: () => OrganizationRoute,
  component: () => <OrganizationSettings />,
});
