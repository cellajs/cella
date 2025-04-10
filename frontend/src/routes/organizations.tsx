import { createRoute, redirect, useLoaderData, useParams } from '@tanstack/react-router';
import { Suspense, lazy } from 'react';
import { z } from 'zod';
import ErrorNotice from '~/modules/common/error-notice';
import { organizationQueryOptions } from '~/modules/organizations/query';

import { onlineManager, useQuery } from '@tanstack/react-query';
import { i18n } from '~/lib/i18n';
import { toaster } from '~/modules/common/toaster';
import { queryClient } from '~/query/query-client';
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
  .extend({ userSheetId: z.string().optional() });

export const memberInvitationsSearchSchema = memberInvitationsQuerySchema.pick({ sort: true, order: true });

export const attachmentsSearchSchema = attachmentsQuerySchema.pick({ q: true, sort: true, order: true }).extend({
  attachmentDialogId: z.string().optional(),
  groupId: z.string().optional(),
});

export const OrganizationRoute = createRoute({
  path: '/$idOrSlug',
  staticData: { pageTitle: 'Organization', isAuth: true },
  beforeLoad: async ({ location, params: { idOrSlug } }) => {
    noDirectAccess(location.pathname, idOrSlug, '/members');

    const queryOptions = organizationQueryOptions(idOrSlug);

    const options = { ...queryOptions, revalidateIfStale: true };
    const isOnline = onlineManager.isOnline();
    const organization = isOnline ? await queryClient.ensureQueryData(options) : queryClient.getQueryData(queryOptions.queryKey);
    if (!organization) {
      toaster(i18n.t('common:offline_cache_miss.text'), 'warning');
      throw redirect({ to: '/home', replace: true });
    }
    return { organization };
  },
  loader: async ({ context: { organization } }) => {
    return organization;
  },
  getParentRoute: () => AppRoute,
  errorComponent: ({ error }) => <ErrorNotice level="app" error={error} />,
  component: () => {
    const { idOrSlug } = useParams({ from: OrganizationRoute.id });
    return (
      // Pass dynamic key, idOrSlug to ensure a re-render when it changes
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
  component: () => {
    const loaderData = useLoaderData({ from: OrganizationRoute.id });

    // Use loader data but also fetch from cache to ensure it's up to date
    const queryData = useQuery(organizationQueryOptions(loaderData.slug));
    const organization = queryData.data ?? loaderData;
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
    const loaderData = useLoaderData({ from: OrganizationRoute.id });

    // Use loader data but also fetch from cache to ensure it's up to date
    const queryData = useQuery(organizationQueryOptions(loaderData.slug));
    const organization = queryData.data ?? loaderData;
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
    const loaderData = useLoaderData({ from: OrganizationRoute.id });

    // Use loader data but also fetch from cache to ensure it's up to date
    const queryData = useQuery(organizationQueryOptions(loaderData.slug));
    const organization = queryData.data ?? loaderData;
    if (!organization) return;
    return (
      <Suspense>
        <OrganizationSettings organization={organization} />
      </Suspense>
    );
  },
});
