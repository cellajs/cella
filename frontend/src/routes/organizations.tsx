import { createRoute, useParams } from '@tanstack/react-router';
import type { ErrorType } from 'backend/lib/errors';
import { membersQuerySchema } from 'backend/modules/general/schema';
import { Suspense, lazy } from 'react';
import { z } from 'zod';
import { queryClient } from '~/lib/router';
import { noDirectAccess } from '~/lib/utils';
import ErrorNotice from '~/modules/common/error-notice';
import { membersQueryOptions } from '~/modules/organizations/members-table';
import Organization, { organizationQueryOptions } from '~/modules/organizations/organization';
import type { Organization as OrganizationType } from '~/types';
import { AppRoute } from '.';

//Lazy-loaded components
const MembersTable = lazy(() => import('~/modules/organizations/members-table'));
const OrganizationSettings = lazy(() => import('~/modules/organizations/organization-settings'));

// Search query schema
export const membersSearchSchema = membersQuerySchema.pick({ q: true, sort: true, order: true, role: true });

export const OrganizationRoute = createRoute({
  path: '$idOrSlug',
  staticData: { pageTitle: 'Organization', isAuth: true },
  beforeLoad: ({ location, params }) => noDirectAccess(location.pathname, params.idOrSlug, '/members'),
  getParentRoute: () => AppRoute,
  loader: async ({ params: { idOrSlug } }) => {
    await queryClient.ensureQueryData(organizationQueryOptions(idOrSlug));
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
  validateSearch: z.object({
    ...membersSearchSchema.shape,
    userIdPreview: z.string().optional(),
  }),
  staticData: { pageTitle: 'Members', isAuth: true },
  getParentRoute: () => OrganizationRoute,
  loaderDeps: ({ search: { q, sort, order, role } }) => ({ q, sort, order, role }),
  loader: async ({ params: { idOrSlug }, deps: { q, sort, order, role } }) => {
    const entityType = 'organization';
    const infiniteQueryOptions = membersQueryOptions({ idOrSlug, entityType, q, sort, order, role, limit: 40 });
    const cachedMembers = queryClient.getQueryData(infiniteQueryOptions.queryKey);
    if (!cachedMembers) queryClient.fetchInfiniteQuery(infiniteQueryOptions);
  },
  component: () => {
    const { idOrSlug } = useParams({ from: OrganizationMembersRoute.id });
    const organization: OrganizationType | undefined = queryClient.getQueryData(['organizations', idOrSlug]);
    if (!organization) return;
    return (
      <Suspense>
        <MembersTable entity={organization} route={OrganizationMembersRoute.id} />
      </Suspense>
    );
  },
});

export const OrganizationSettingsRoute = createRoute({
  path: '/settings',
  staticData: { pageTitle: 'Settings', isAuth: true },
  getParentRoute: () => OrganizationRoute,
  component: () => {
    const { idOrSlug } = useParams({ from: OrganizationSettingsRoute.id });
    const organization: OrganizationType | undefined = queryClient.getQueryData(['organizations', idOrSlug]);
    if (!organization) return;
    return (
      <Suspense>
        <OrganizationSettings organization={organization} />
      </Suspense>
    );
  },
});
