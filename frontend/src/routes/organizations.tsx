import { onlineManager, useQuery } from '@tanstack/react-query';
import { createRoute, redirect, useLoaderData, useParams } from '@tanstack/react-router';
import i18n from 'i18next';
import { lazy, Suspense } from 'react';
import { z } from 'zod';
import { zGetAttachmentsData, zGetMembersData, zGetPendingInvitationsData } from '~/api.gen/zod.gen';
import ErrorNotice from '~/modules/common/error-notice';
import { toaster } from '~/modules/common/toaster';
import { organizationQueryOptions } from '~/modules/organizations/query';
import { queryClient } from '~/query/query-client';
import { AppRoute } from '~/routes/base';
import appTitle from '~/utils/app-title';
import { noDirectAccess } from '~/utils/no-direct-access';

//Lazy-loaded components
const OrganizationPage = lazy(() => import('~/modules/organizations/organization-page'));
const MembersTable = lazy(() => import('~/modules/memberships/members-table/table-wrapper'));
const AttachmentsTable = lazy(() => import('~/modules/attachments/table/table-wrapper'));
const OrganizationSettings = lazy(() => import('~/modules/organizations/organization-settings'));

// Search query schema
export const membersSearchSchema = zGetMembersData.shape.query
  .pick({ q: true, sort: true, order: true, role: true })
  .extend({ userSheetId: z.string().optional() });

export const pendingInvitationsSearchSchema = zGetPendingInvitationsData.shape.query.pick({ sort: true, order: true });

export const attachmentsSearchSchema = zGetAttachmentsData.shape.query.unwrap().pick({ q: true, sort: true, order: true }).extend({
  attachmentDialogId: z.string().optional(),
  groupId: z.string().optional(),
});

export const OrganizationRoute = createRoute({
  path: '/organizations/$idOrSlug',
  staticData: { isAuth: true },
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
  loader: ({ context: { organization } }) => organization,
  head: (ctx) => {
    const organization = ctx.match.loaderData;
    return { meta: [{ title: appTitle(organization?.name) }] };
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
  staticData: { isAuth: true },
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
  staticData: { isAuth: true },
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
        <AttachmentsTable canUpload={true} key={organization.id} entity={organization} />
      </Suspense>
    );
  },
});

export const OrganizationSettingsRoute = createRoute({
  path: '/settings',
  staticData: { isAuth: true },
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
