import { createRoute, useParams } from '@tanstack/react-router';
import { membersQuerySchema } from 'backend/modules/general/schema';
import { Suspense, lazy } from 'react';
import { z } from 'zod';
import { offlineFetch, offlineFetchInfinite } from '~/lib/query-client';
import { queryClient } from '~/lib/router';
import ErrorNotice from '~/modules/common/error-notice';
import { membersQueryOptions } from '~/modules/organizations/members-table/helpers/query-options';
import { organizationQueryOptions } from '~/modules/organizations/organization-page';
import { baseEntityRoutes } from '~/nav-config';
import type { Organization as OrganizationType } from '~/types/common';
import { noDirectAccess } from '~/utils/no-direct-access';
import type { ErrorType } from '#/lib/errors';
import { attachmentsQuerySchema } from '#/modules/attachments/schema';
import { AppRoute } from './general';

//Lazy-loaded components
const OrganizationPage = lazy(() => import('~/modules/organizations/organization-page'));
const MembersTable = lazy(() => import('~/modules/organizations/members-table'));
const AttachmentsTable = lazy(() => import('~/modules/organizations/attachments-table'));
const OrganizationSettings = lazy(() => import('~/modules/organizations/organization-settings'));

// Search query schema
export const membersSearchSchema = membersQuerySchema.pick({ q: true, sort: true, order: true, role: true });

export const attachmentsSearchSchema = attachmentsQuerySchema.pick({ q: true, sort: true, order: true });

export const OrganizationRoute = createRoute({
  path: baseEntityRoutes.organization,
  staticData: { pageTitle: 'Organization', isAuth: true },
  beforeLoad: ({ location, params }) => noDirectAccess(location.pathname, params.idOrSlug, '/members'),
  getParentRoute: () => AppRoute,
  loader: ({ params: { idOrSlug } }) => {
    const queryOptions = organizationQueryOptions(idOrSlug);
    return offlineFetch(queryOptions);
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
  staticData: { pageTitle: 'members', isAuth: true },
  getParentRoute: () => OrganizationRoute,
  loaderDeps: ({ search: { q, sort, order, role } }) => ({ q, sort, order, role }),
  loader: ({ params: { idOrSlug }, deps: { q, sort, order, role } }) => {
    const entityType = 'organization';
    const queryOptions = membersQueryOptions({ idOrSlug, orgIdOrSlug: idOrSlug, entityType, q, sort, order, role });
    return offlineFetchInfinite(queryOptions);
  },
  component: () => {
    const { idOrSlug } = useParams({ from: OrganizationMembersRoute.id });
    const organization: OrganizationType | undefined = queryClient.getQueryData(['organizations', idOrSlug]);

    if (!organization) return;
    return (
      <Suspense>
        <MembersTable key={organization.id} entity={organization} />
      </Suspense>
    );
  },
});

export const OrganizationAttachmentsRoute = createRoute({
  path: '/attachments',
  validateSearch: attachmentsSearchSchema,
  staticData: { pageTitle: 'attachments', isAuth: true },
  getParentRoute: () => OrganizationRoute,
  loaderDeps: ({ search: { q, sort, order } }) => ({ q, sort, order }),
  component: () => {
    const { idOrSlug } = useParams({ from: OrganizationAttachmentsRoute.id });
    const organization: OrganizationType | undefined = queryClient.getQueryData(['organizations', idOrSlug]);

    if (!organization) return;
    return (
      <Suspense>
        <AttachmentsTable organization={organization} />
      </Suspense>
    );
  },
});

export const OrganizationSettingsRoute = createRoute({
  path: '/settings',
  staticData: { pageTitle: 'settings', isAuth: true },
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
