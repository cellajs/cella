import { onlineManager } from '@tanstack/react-query';
import { createRoute, redirect, useLoaderData } from '@tanstack/react-router';
import i18n from 'i18next';
import { lazy, Suspense } from 'react';
import ErrorNotice from '~/modules/common/error-notice';
import { organizationQueryKeys, organizationQueryOptions } from '~/modules/organizations/query';
import { queryClient } from '~/query/query-client';
import { AppLayoutRoute } from '~/routes/base-routes';
import { attachmentsRouteSearchParamsSchema, membersRouteSearchParamsSchema } from '~/routes/search-params-schemas';
import { useToastStore } from '~/store/toast';
import appTitle from '~/utils/app-title';
import { noDirectAccess } from '~/utils/no-direct-access';

//Lazy-loaded components
const OrganizationPage = lazy(() => import('~/modules/organizations/organization-page'));
const MembersTable = lazy(() => import('~/modules/memberships/members-table'));
const AttachmentsTable = lazy(() => import('~/modules/attachments/table'));
const OrganizationSettings = lazy(() => import('~/modules/organizations/organization-settings'));

export const OrganizationRoute = createRoute({
  path: '/organization/$idOrSlug',
  staticData: { isAuth: true },
  beforeLoad: async ({ params: { idOrSlug } }) => {
    noDirectAccess(OrganizationRoute.to, OrganizationMembersRoute.to);
    const isOnline = onlineManager.isOnline();

    const bootstrap = organizationQueryOptions(idOrSlug);
    const bootstrapWithRevalidate = { ...bootstrap, revalidateIfStale: true };

    const organization = isOnline
      ? await queryClient.ensureQueryData(bootstrapWithRevalidate)
      : queryClient.getQueryData(bootstrap.queryKey);

    if (!organization) {
      if (!isOnline) useToastStore.getState().showToast(i18n.t('common:offline_cache_miss.text'), 'warning');
      throw redirect({ to: '/home', replace: true });
    }

    // Canonical cache entry (always ID), remove slug entry
    queryClient.setQueryData(organizationQueryKeys.detail.byId(organization.id), organization);
    queryClient.removeQueries({ queryKey: bootstrap.queryKey, exact: true });

    return { organization };
  },
  loader: ({ context: { organization } }) => organization,
  head: (ctx) => {
    const organization = ctx.match.loaderData;
    return { meta: [{ title: appTitle(organization?.name) }] };
  },
  getParentRoute: () => AppLayoutRoute,
  errorComponent: ({ error }) => <ErrorNotice level="app" error={error} />,
  component: () => {
    const organization = useLoaderData({ from: OrganizationRoute.id });
    return (
      <Suspense>
        <OrganizationPage key={organization.slug} organizationId={organization.id} />
      </Suspense>
    );
  },
});

export const OrganizationMembersRoute = createRoute({
  path: '/members',
  validateSearch: membersRouteSearchParamsSchema,
  staticData: { isAuth: true },
  getParentRoute: () => OrganizationRoute,
  loaderDeps: ({ search: { q, sort, order, role } }) => ({ q, sort, order, role }),
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
  validateSearch: attachmentsRouteSearchParamsSchema,
  staticData: { isAuth: true },
  getParentRoute: () => OrganizationRoute,
  loaderDeps: ({ search: { q, sort, order } }) => ({ q, sort, order }),
  component: () => {
    const organization = useLoaderData({ from: OrganizationRoute.id });
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
    const organization = useLoaderData({ from: OrganizationRoute.id });
    if (!organization) return;
    return (
      <Suspense>
        <OrganizationSettings organization={organization} />
      </Suspense>
    );
  },
});
