import { onlineManager, useSuspenseQuery } from '@tanstack/react-query';
import { createRoute, Outlet } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
import { getOrganization, type Organization } from 'sdk';
import { attachmentsRouteSearchParamsSchema } from '~/modules/attachment/search-params-schemas';
import { ErrorNotice } from '~/modules/common/error-notice';
import { Spinner } from '~/modules/common/spinner';
import { membersRouteSearchParamsSchema } from '~/modules/memberships/search-params-schemas';
import {
  findOrganizationByIdOrSlug,
  organizationQueryKeys,
  organizationQueryOptions,
} from '~/modules/organization/query';
import { fetchSlugCacheId } from '~/query/basic';
import { queryClient } from '~/query/query-client';
import { AppLayoutRoute } from '~/routes/base-routes';
import appTitle from '~/utils/app-title';
import { noDirectAccess } from '~/utils/no-direct-access';
import { redirectOnMissing } from '~/utils/redirect-on-missing';
import { rewriteUrlToSlug } from '~/utils/rewrite-url-to-slug';

const OrganizationPage = lazy(() => import('~/modules/organization/organization-page'));
const MembersTable = lazy(() => import('~/modules/memberships/members-table/members-table'));
const AttachmentsTable = lazy(() => import('~/modules/attachment/table/attachments-table'));
const OrganizationSettings = lazy(() => import('~/modules/organization/organization-settings'));

/**
 * Layout route for tenant and organization-scoped pages.
 * Captures $tenantId and $organizationSlug params, validates tenant access,
 * fetches org, and provides context for all nested routes.
 * Forks can nest additional routes (workspace, project, etc.) under this layout.
 */
export const OrganizationLayoutRoute = createRoute({
  path: '/$tenantId/$organizationSlug',
  staticData: { isAuth: true },
  getParentRoute: () => AppLayoutRoute,
  beforeLoad: async ({ params, cause }) => {
    // TODO not working Only revalidate on initial entry — search param changes are handled by child useSuspenseQuery
    const shouldRevalidate = cause === 'enter';

    const { tenantId, organizationSlug } = params;
    const isOnline = onlineManager.isOnline();

    // Resolve slug to ID via list cache (from menu), or fetch if not cached
    const cached = findOrganizationByIdOrSlug(organizationSlug, tenantId);
    const organizationId = cached?.id;

    // If we have the ID from cache, use ID-based query; otherwise fetch by slug first
    let organization: Organization | undefined;

    if (organizationId) {
      const orgOptions = organizationQueryOptions(organizationId, tenantId);

      // Seed detail cache from list cache so ensureQueryData returns immediately
      // instead of blocking on a fetch. It will still revalidate in background if stale.
      if (cached && !queryClient.getQueryData(orgOptions.queryKey)) {
        queryClient.setQueryData(orgOptions.queryKey, cached);
      }

      organization =
        queryClient.getQueryData(orgOptions.queryKey) ??
        (await queryClient.ensureQueryData({ ...orgOptions, revalidateIfStale: shouldRevalidate }));
    } else if (isOnline) {
      organization = await fetchSlugCacheId(
        () => getOrganization({ path: { tenantId, id: organizationSlug }, query: { slug: true, include: 'counts' } }),
        organizationQueryKeys.detail.byId,
      );
    }

    redirectOnMissing(organization);

    // Rewrite URL to use slug if user navigated with ID
    rewriteUrlToSlug(params, { tenantId, organizationSlug: organization.slug }, OrganizationLayoutRoute.to);

    return { organization, tenantId };
  },
  component: () => <Outlet />,
});

/**
 * Main organization page with details and navigation.
 */
export const OrganizationRoute = createRoute({
  path: '/organization',
  staticData: { isAuth: true, floatingNavButtons: { left: 'menu' } },
  beforeLoad: () => {
    noDirectAccess(OrganizationRoute.to, OrganizationAttachmentsRoute.to);
  },
  head: ({ match }) => ({ meta: [{ title: appTitle(match.context.organization?.name) }] }),
  getParentRoute: () => OrganizationLayoutRoute,
  errorComponent: ({ error }) => <ErrorNotice boundary="app" error={error} />,
  component: () => {
    const { organization, tenantId } = OrganizationRoute.useRouteContext();
    const { data } = useSuspenseQuery(organizationQueryOptions(organization.id, tenantId));
    return (
      <Suspense fallback={<Spinner className="mt-[45vh] h-10 w-10" />}>
        <OrganizationPage key={data.id} organizationId={data.id} tenantId={tenantId} />
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
  head: ({ match }) => ({ meta: [{ title: appTitle(`Members · ${match.context.organization?.name}`) }] }),
  getParentRoute: () => OrganizationRoute,
  component: () => {
    const { organization, tenantId } = OrganizationMembersRoute.useRouteContext();
    const { data } = useSuspenseQuery(organizationQueryOptions(organization.id, tenantId));
    return (
      <Suspense>
        <MembersTable key={data.id} contextEntity={data} />
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
  head: ({ match }) => ({ meta: [{ title: appTitle(`Attachments · ${match.context.organization?.name}`) }] }),
  getParentRoute: () => OrganizationRoute,
  component: () => {
    const { organization, tenantId } = OrganizationAttachmentsRoute.useRouteContext();
    const { data } = useSuspenseQuery(organizationQueryOptions(organization.id, tenantId));
    return (
      <Suspense>
        <AttachmentsTable canUpload={true} key={data.id} contextEntity={data} />
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
  head: ({ match }) => ({ meta: [{ title: appTitle(`Settings · ${match.context.organization?.name}`) }] }),
  getParentRoute: () => OrganizationRoute,
  component: () => {
    const { organization, tenantId } = OrganizationSettingsRoute.useRouteContext();
    const { data } = useSuspenseQuery(organizationQueryOptions(organization.id, tenantId));
    return (
      <Suspense>
        <OrganizationSettings organization={data} />
      </Suspense>
    );
  },
});
