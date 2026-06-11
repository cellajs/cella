import { onlineManager } from '@tanstack/react-query';
import { getOrganization, type Organization } from 'sdk';
import {
  findOrganizationByIdOrSlug,
  organizationQueryKeys,
  organizationQueryOptions,
} from '~/modules/organization/query';
import { fetchSlugCacheId } from '~/query/basic';
import { queryClient } from '~/query/query-client';
import { redirectOnMissing } from '~/utils/redirect-on-missing';
import { rewriteUrlToSlug } from '~/utils/rewrite-url-to-slug';

type OrganizationLayoutBeforeLoadArgs = {
  params: { tenantId: string; organizationSlug: string };
  cause: 'preload' | 'enter' | 'stay';
};

/**
 * beforeLoad logic for the organization layout route.
 * Captures $tenantId and $organizationSlug params, validates tenant access,
 * fetches org, and provides context for all nested routes.
 */
export const organizationLayoutBeforeLoad = async ({ params, cause }: OrganizationLayoutBeforeLoadArgs) => {
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
  rewriteUrlToSlug(params, { tenantId, organizationSlug: organization.slug }, '/$tenantId/$organizationSlug');

  return { organization, tenantId };
};
