import { onlineManager } from '@tanstack/react-query';
import { createRoute, useParams } from '@tanstack/react-router';
import { membersQuerySchema } from 'backend/modules/general/schema';
import { Suspense, lazy } from 'react';
import { z } from 'zod';
import { queryClient } from '~/lib/router';
import { noDirectAccess } from '~/lib/utils';
import ErrorNotice from '~/modules/common/error-notice';
import { membersQueryOptions } from '~/modules/organizations/members-table/helpers/query-options';
import { organizationQueryOptions } from '~/modules/organizations/organization-page';
import { baseEntityRoutes } from '~/nav-config';
import type { Organization as OrganizationType } from '~/types/common';
import type { ErrorType } from '#/lib/errors';
import { AppRoute } from './general';

//Lazy-loaded components
const OrganizationPage = lazy(() => import('~/modules/organizations/organization-page'));
const MembersTable = lazy(() => import('~/modules/organizations/members-table'));
const OrganizationSettings = lazy(() => import('~/modules/organizations/organization-settings'));

// Search query schema
export const membersSearchSchema = membersQuerySchema.pick({ q: true, sort: true, order: true, role: true });

export const OrganizationRoute = createRoute({
  path: baseEntityRoutes.organization,
  staticData: { pageTitle: 'Organization', isAuth: true },
  beforeLoad: ({ location, params }) => noDirectAccess(location.pathname, params.idOrSlug, '/members'),
  getParentRoute: () => AppRoute,
  loader: ({ params: { idOrSlug } }) => {
    const queryOptions = organizationQueryOptions(idOrSlug);
    const cachedData = queryClient.getQueryData(queryOptions.queryKey);
    // do not load if we are offline or hydrating because it returns a promise that is pending until we go online again
    return cachedData ?? (onlineManager.isOnline() ? queryClient.fetchQuery(queryOptions) : undefined);
  },
  errorComponent: ({ error }) => <ErrorNotice error={error as ErrorType} />,
  component: () => (
    <Suspense>
      <OrganizationPage />
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
  loader: ({ params: { idOrSlug }, deps: { q, sort, order, role } }) => {
    const entityType = 'organization';
    const queryOptions = membersQueryOptions({ idOrSlug, entityType, q, sort, order, role, limit: 40 });
    const cachedData = queryClient.getQueryData(queryOptions.queryKey);
    // do not load if we are offline or hydrating because it returns a promise that is pending until we go online again
    return cachedData ?? (onlineManager.isOnline() ? queryClient.fetchInfiniteQuery(queryOptions) : undefined);
  },
  component: () => {
    const { idOrSlug } = useParams({ from: OrganizationMembersRoute.id });
    const organization: OrganizationType | undefined = queryClient.getQueryData(['organizations', idOrSlug]);

    if (!organization) return;
    return (
      <Suspense>
        <MembersTable entity={organization} />
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
