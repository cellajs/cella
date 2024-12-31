import { createRoute, useParams } from '@tanstack/react-router';
import { membersQuerySchema } from 'backend/modules/general/schema';
import { Suspense, lazy } from 'react';
import { z } from 'zod';
import { offlineFetch, offlineFetchInfinite } from '~/lib/query-client';
import { queryClient } from '~/lib/router';
import ErrorNotice from '~/modules/common/error-notice';
import { baseEntityRoutes } from '~/nav-config';
import { attachmentsQueryOptions, membersQueryOptions } from '~/query/infinite-query-options';
import { organizationQueryOptions } from '~/query/query-options';
import { AppRoute } from '~/routes/general';
import type { Organization as OrganizationType } from '~/types/common';
import { noDirectAccess } from '~/utils/no-direct-access';
import type { ErrorType } from '#/lib/errors';
import { attachmentsQuerySchema } from '#/modules/attachments/schema';

//Lazy-loaded components
const OrganizationPage = lazy(() => import('~/modules/organizations/organization-page'));
const OrgMembersTable = lazy(() => import('~/modules/organizations/organization-members-table'));
const AttachmentsTable = lazy(() => import('~/modules/attachments/attachments-table'));
const OrganizationSettings = lazy(() => import('~/modules/organizations/organization-settings'));

// Search query schema
export const membersSearchSchema = membersQuerySchema
  .pick({ q: true, sort: true, order: true, role: true })
  .extend({ sheetId: z.string().optional() });

export const attachmentsSearchSchema = attachmentsQuerySchema.pick({ q: true, sort: true, order: true }).extend({
  attachmentPreview: z.string().optional(),
});

export const OrganizationRoute = createRoute({
  path: baseEntityRoutes.organization,
  staticData: { pageTitle: 'Organization', isAuth: true },
  beforeLoad: async ({ location, params: { idOrSlug } }) => {
    noDirectAccess(location.pathname, idOrSlug, '/members');
    // to be able to use it in child routes as context
    const queryOptions = organizationQueryOptions(idOrSlug);
    const organization = (await offlineFetch(queryOptions)) as OrganizationType | undefined;
    return { organization };
  },
  getParentRoute: () => AppRoute,
  errorComponent: ({ error }) => <ErrorNotice error={error as ErrorType} />,
  component: () => {
    const { idOrSlug } = useParams({ from: OrganizationRoute.id });
    return (
      <Suspense>
        <OrganizationPage key={idOrSlug} />
      </Suspense>
    );
  },
});

export const OrganizationMembersRoute = createRoute({
  path: '/members',
  validateSearch: membersSearchSchema,
  staticData: { pageTitle: 'members', isAuth: true },
  getParentRoute: () => OrganizationRoute,
  loaderDeps: ({ search: { q, sort, order, role } }) => ({ q, sort, order, role }),
  loader: ({ params: { idOrSlug }, deps: { q, sort, order, role }, context }) => {
    const entityType = 'organization';
    const orgIdOrSlug = context.organization?.id || idOrSlug;
    const queryOptions = membersQueryOptions({ idOrSlug, orgIdOrSlug, entityType, q, sort, order, role });
    return offlineFetchInfinite(queryOptions);
  },
  component: () => (
    <Suspense>
      <OrgMembersTable />
    </Suspense>
  ),
});

export const OrganizationAttachmentsRoute = createRoute({
  path: '/attachments',
  validateSearch: attachmentsSearchSchema,
  staticData: { pageTitle: 'attachments', isAuth: true },
  getParentRoute: () => OrganizationRoute,
  loaderDeps: ({ search: { q, sort, order } }) => ({ q, sort, order }),
  loader: ({ params: { idOrSlug }, deps: { q, sort, order }, context }) => {
    const orgIdOrSlug = context.organization?.id || idOrSlug;
    const queryOptions = attachmentsQueryOptions({ orgIdOrSlug, q, sort, order });
    return offlineFetchInfinite(queryOptions);
  },
  component: () => {
    const { idOrSlug } = useParams({ from: OrganizationAttachmentsRoute.id });
    const orgQueryOptions = organizationQueryOptions(idOrSlug);
    const organization: OrganizationType | undefined = queryClient.getQueryData(orgQueryOptions.queryKey);

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
    const orgQueryOptions = organizationQueryOptions(idOrSlug);
    const organization: OrganizationType | undefined = queryClient.getQueryData(orgQueryOptions.queryKey);

    if (!organization) return;
    return (
      <Suspense>
        <OrganizationSettings organization={organization} />
      </Suspense>
    );
  },
});
