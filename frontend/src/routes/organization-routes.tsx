import { onlineManager } from '@tanstack/react-query';
import { createRoute, Outlet, redirect, useLoaderData } from '@tanstack/react-router';
import i18n from 'i18next';
import { lazy, Suspense } from 'react';
import { type Organization, getOrganization } from '~/api.gen';
import { attachmentsRouteSearchParamsSchema } from '~/modules/attachment/search-params-schemas';
import ErrorNotice from '~/modules/common/error-notice';
import { membersRouteSearchParamsSchema } from '~/modules/memberships/search-params-schemas';
import { findOrganizationInListCache, organizationQueryKeys, organizationQueryOptions } from '~/modules/organization/query';
import { queryClient } from '~/query/query-client';
import { AppLayoutRoute } from '~/routes/base-routes';
import { useToastStore } from '~/store/toast';
import appTitle from '~/utils/app-title';
import { noDirectAccess } from '~/utils/no-direct-access';
import { rewriteUrlToSlug } from '~/utils/rewrite-url-to-slug';

//Lazy-loaded components
const OrganizationPage = lazy(() => import('~/modules/organization/organization-page'));
const MembersTable = lazy(() => import('~/modules/memberships/members-table/members-table'));
const AttachmentsTable = lazy(() => import('~/modules/attachment/table/attachments-table'));
const OrganizationSettings = lazy(() => import('~/modules/organization/organization-settings'));

/**
 * Layout route for organization-scoped pages.
 * Captures $idOrSlug param, fetches org, and provides context for all nested routes.
 * Forks can nest additional routes (workspace, project, etc.) under this layout.
 */
export const OrganizationLayoutRoute = createRoute({
  path: '/$idOrSlug',
  staticData: { isAuth: true, entityType: 'organization' },
  getParentRoute: () => AppLayoutRoute,
  beforeLoad: async ({ params }) => {
    const { idOrSlug } = params;
    const isOnline = onlineManager.isOnline();

    // Resolve slug to ID via list cache (from menu), or fetch if not cached
    const cached = findOrganizationInListCache(idOrSlug);
    const orgId = cached?.id;

    // If we have the ID from cache, use ID-based query; otherwise fetch by slug first
    let organization: Organization | undefined;

    if (orgId) {
      // We know the ID - use canonical cache key
      const orgOptions = organizationQueryOptions(orgId);
      organization = isOnline
        ? await queryClient.ensureQueryData({ ...orgOptions, revalidateIfStale: true })
        : queryClient.getQueryData(orgOptions.queryKey) ?? cached;
    } else if (isOnline) {
      // No cache - fetch by slug, then populate ID-based cache
      const fetched = await getOrganization({ path: { idOrSlug } });
      if (fetched) {
        queryClient.setQueryData(organizationQueryKeys.detail.byId(fetched.id), fetched);
        organization = fetched;
      }
    }

    if (!organization) {
      if (!isOnline) useToastStore.getState().showToast(i18n.t('common:offline_cache_miss.text'), 'warning');
      throw redirect({ to: '/home', replace: true });
    }

    // Rewrite URL to use slug if user navigated with ID
    rewriteUrlToSlug(params, { idOrSlug: organization.slug }, OrganizationLayoutRoute.to);

    return { organization };
  },
  loader: ({ context: { organization } }) => organization,
  component: () => <Outlet />,
});

/**
 * Main organization page with details and navigation.
 */
export const OrganizationRoute = createRoute({
  path: '/organization',
  staticData: { isAuth: true },
  beforeLoad: ({ context: { organization } }) =>
    noDirectAccess(`/${organization.slug}/organization`, `/${organization.slug}/organization/members`),
  loader: ({ context: { organization } }) => organization,
  head: ({ loaderData: organization }) => ({ meta: [{ title: appTitle(organization?.name) }] }),
  getParentRoute: () => OrganizationLayoutRoute,
  errorComponent: ({ error }) => <ErrorNotice level="app" error={error} />,
  component: () => {
    const organization = useLoaderData({ from: OrganizationLayoutRoute.id });
    return (
      <Suspense>
        <OrganizationPage key={organization.slug} organizationId={organization.id} />
      </Suspense>
    );
  },
});

/**
 * Organization members table for managing memberships.
 */
export const OrganizationMembersRoute = createRoute({
  path: '/members',
  validateSearch: membersRouteSearchParamsSchema,
  staticData: { isAuth: true, navTab: { id: 'members', label: 'common:members' } },
  getParentRoute: () => OrganizationRoute,
  loaderDeps: ({ search: { q, sort, order, role } }) => ({ q, sort, order, role }),
  component: () => {
    const organization = useLoaderData({ from: OrganizationLayoutRoute.id });
    if (!organization) return;
    return (
      <Suspense>
        <MembersTable key={organization.id} entity={organization} />
      </Suspense>
    );
  },
});

/**
 * Organization attachments table for file management.
 */
export const OrganizationAttachmentsRoute = createRoute({
  path: '/attachments',
  validateSearch: attachmentsRouteSearchParamsSchema,
  staticData: { isAuth: true, navTab: { id: 'attachments', label: 'common:attachments' } },
  getParentRoute: () => OrganizationRoute,
  component: () => {
    const organization = useLoaderData({ from: OrganizationLayoutRoute.id });
    if (!organization) return;
    return (
      <Suspense>
        <AttachmentsTable canUpload={true} key={organization.id} entity={organization} />
      </Suspense>
    );
  },
});

/**
 * Organization settings page for configuration options.
 */
export const OrganizationSettingsRoute = createRoute({
  path: '/settings',
  staticData: { isAuth: true, navTab: { id: 'settings', label: 'common:settings' } },
  getParentRoute: () => OrganizationRoute,
  component: () => {
    const organization = useLoaderData({ from: OrganizationLayoutRoute.id });
    if (!organization) return;
    return (
      <Suspense>
        <OrganizationSettings organization={organization} />
      </Suspense>
    );
  },
});
