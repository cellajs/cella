import { onlineManager, useQuery } from '@tanstack/react-query';
import { createRoute, redirect, useLoaderData, useParams } from '@tanstack/react-router';
import i18n from 'i18next';
import { lazy, Suspense } from 'react';
import ErrorNotice from '~/modules/common/error-notice';
import { organizationQueryOptions } from '~/modules/organizations/query';
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

    const queryOptions = organizationQueryOptions(idOrSlug);
    const options = { ...queryOptions, revalidateIfStale: true };

    const organization = isOnline ? await queryClient.ensureQueryData(options) : queryClient.getQueryData(queryOptions.queryKey);

    if (!organization) {
      if (!isOnline) useToastStore.getState().showToast(i18n.t('common:offline_cache_miss.text'), 'warning');
      throw redirect({ to: '/home', replace: true });
    }
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
  validateSearch: membersRouteSearchParamsSchema,
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
  validateSearch: attachmentsRouteSearchParamsSchema,
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
