import { onlineManager } from '@tanstack/react-query';
import { createRoute } from '@tanstack/react-router';
import { getOrganization, type Organization } from 'sdk';
import { attachmentsRouteSearchParamsSchema } from '~/modules/attachment/search-params-schemas';
import { membersRouteSearchParamsSchema } from '~/modules/memberships/search-params-schemas';
import {
  findOrganizationByIdOrSlug,
  organizationQueryKeys,
  organizationQueryOptions,
} from '~/modules/organization/query';
import { fetchSlugCacheId } from '~/query/basic';
import { queryClient } from '~/query/query-client';
import { AppLayoutRoute } from '~/routes/base-routes';
import {
  OrganizationAttachmentsComponent,
  OrganizationLayoutComponent,
  OrganizationMembersComponent,
  OrganizationRouteComponent,
  OrganizationSettingsComponent,
} from '~/routes/organization-components';
import { createErrorComponent } from '~/routes/route-utils';
import appTitle from '~/utils/app-title';
import { noDirectAccess } from '~/utils/no-direct-access';
import { redirectOnMissing } from '~/utils/redirect-on-missing';
import { rewriteUrlToSlug } from '~/utils/rewrite-url-to-slug';

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
    // Redirect bare layout path to the organization page
    noDirectAccess(OrganizationLayoutRoute.to, OrganizationRoute.to);

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
  component: OrganizationLayoutComponent,
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
  errorComponent: createErrorComponent('app'),
  component: OrganizationRouteComponent,
});

/**
 * Organization members table for managing memberships.
 */
export const OrganizationMembersRoute = createRoute({
  path: '/members',
  validateSearch: membersRouteSearchParamsSchema,
  staticData: { isAuth: true, navTab: { id: 'members', label: 'c:members' } },
  head: ({ match }) => ({ meta: [{ title: appTitle(`Members · ${match.context.organization?.name}`) }] }),
  getParentRoute: () => OrganizationRoute,
  component: OrganizationMembersComponent,
});

/**
 * Organization attachments table for file management.
 */
export const OrganizationAttachmentsRoute = createRoute({
  path: '/attachments',
  validateSearch: attachmentsRouteSearchParamsSchema,
  staticData: { isAuth: true, navTab: { id: 'attachments', label: 'c:attachments' } },
  head: ({ match }) => ({ meta: [{ title: appTitle(`Attachments · ${match.context.organization?.name}`) }] }),
  getParentRoute: () => OrganizationRoute,
  component: OrganizationAttachmentsComponent,
});

/**
 * Organization settings page for configuration options.
 */
export const OrganizationSettingsRoute = createRoute({
  path: '/settings',
  staticData: { isAuth: true, navTab: { id: 'settings', label: 'c:settings' } },
  head: ({ match }) => ({ meta: [{ title: appTitle(`Settings · ${match.context.organization?.name}`) }] }),
  getParentRoute: () => OrganizationRoute,
  component: OrganizationSettingsComponent,
});
