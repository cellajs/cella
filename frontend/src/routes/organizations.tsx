import { createRoute, useLoaderData } from '@tanstack/react-router';
import { Suspense, lazy } from 'react';
import { z } from 'zod';
import { attachmentsQueryOptions } from '~/modules/attachments/query';
import ErrorNotice from '~/modules/common/error-notice';
import { membersQueryOptions } from '~/modules/memberships/query';
import { organizationQueryOptions } from '~/modules/organizations/query';

import { AppRoute } from '~/routes/base';
import { noDirectAccess } from '~/utils/no-direct-access';
import { attachmentsQuerySchema } from '#/modules/attachments/schema';
import { memberInvitationsQuerySchema, membersQuerySchema } from '#/modules/memberships/schema';

//Lazy-loaded components
const OrganizationPage = lazy(() => import('~/modules/organizations/organization-page'));
const MembersTable = lazy(() => import('~/modules/memberships/members-table/table-wrapper'));
const AttachmentsTable = lazy(() => import('~/modules/attachments/table/table-wrapper'));
const OrganizationSettings = lazy(() => import('~/modules/organizations/organization-settings'));

// Search query schema
export const membersSearchSchema = membersQuerySchema
  .pick({ q: true, sort: true, order: true, role: true })
  .extend({ sheetId: z.string().optional() });

export const memberInvitationsSearchSchema = memberInvitationsQuerySchema.pick({ sort: true, order: true });

export const attachmentsSearchSchema = attachmentsQuerySchema.pick({ q: true, sort: true, order: true }).extend({
  attachmentPreview: z.string().optional(),
  groupId: z.string().optional(),
});

export const OrganizationRoute = createRoute({
  path: '/$idOrSlug',
  staticData: { pageTitle: 'Organization', isAuth: true },
  beforeLoad: async ({ location, params: { idOrSlug }, context }) => {
    noDirectAccess(location.pathname, idOrSlug, '/members');
    const queryOptions = organizationQueryOptions(idOrSlug);

    return { organization: await context.queryClient.fetchQuery(queryOptions) };
  },
  loader: async ({ context: { organization } }) => {
    return organization;
  },
  getParentRoute: () => AppRoute,
  errorComponent: ({ error }) => <ErrorNotice level="app" error={error} />,
  component: () => {
    return (
      <Suspense>
        <OrganizationPage />
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
  loader: async ({ context, params: { idOrSlug }, deps: { q, sort, order, role } }) => {
    const entityType = 'organization';
    const orgIdOrSlug = context.organization.id ?? idOrSlug;

    const queryOptions = membersQueryOptions({ idOrSlug, orgIdOrSlug, entityType, q, sort, order, role });

    await context.queryClient.prefetchInfiniteQuery(queryOptions);
  },
  component: () => {
    const organization = useLoaderData({ from: OrganizationRoute.id });
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
  loader: async ({ deps: { q, sort, order }, context, params: { idOrSlug } }) => {
    const orgIdOrSlug = context.organization.id ?? idOrSlug;
    const queryOptions = attachmentsQueryOptions({ orgIdOrSlug, q, sort, order });

    await context.queryClient.prefetchInfiniteQuery(queryOptions);
  },
  component: () => {
    const organization = useLoaderData({ from: OrganizationRoute.id });
    if (!organization) return;
    return (
      <Suspense>
        <AttachmentsTable key={organization.id} entity={organization} />
      </Suspense>
    );
  },
});

export const OrganizationSettingsRoute = createRoute({
  path: '/settings',
  staticData: { pageTitle: 'settings', isAuth: true },
  getParentRoute: () => OrganizationRoute,
  component: () => {
    const organization = useLoaderData({ from: OrganizationRoute.id });
    if (!organization) return;
    return (
      <Suspense>
        <OrganizationSettings organization={organization} />
      </Suspense>
    );
  },
});
