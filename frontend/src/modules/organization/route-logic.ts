import { getOrganization } from 'sdk';
import { guardNavTabs } from '~/modules/common/page/tab-nav';
import { loadChannelTabGrants } from '~/modules/entities/use-channel-tab-options';
import { findOrganizationByIdOrSlug, organizationQueryOptions } from '~/modules/organization/query';
import type { EnrichedOrganization } from '~/modules/organization/types';
import { resolveChannelBySlug } from '~/query/basic/resolve-channel-by-slug';

type OrganizationLayoutBeforeLoadArgs = { params: { tenantId: string; organizationSlug: string }; cause: 'preload' | 'enter' | 'stay' };

/** Loads and authorizes the organization route context. */
export const organizationLayoutBeforeLoad = async ({ params, cause }: OrganizationLayoutBeforeLoadArgs) => {
  // Revalidate a stale organization on fresh entry only; preloads and in-route param changes reuse the cache.
  const shouldRevalidate = cause === 'enter';

  const { tenantId, organizationSlug } = params;

  const organization = await resolveChannelBySlug({
    idOrSlug: organizationSlug,
    tenantId,
    findInCache: findOrganizationByIdOrSlug,
    detailQueryOptions: (id) => organizationQueryOptions(id, tenantId),
    fetchBySlug: () => getOrganization({ path: { tenantId, organizationId: organizationSlug }, query: { slug: true, include: 'counts' } }),
    readRequiresOnline: false,
    revalidateIfStale: shouldRevalidate,
    params,
    buildSlugOverrides: (entity) => ({ tenantId, organizationSlug: entity.slug }),
  });

  return { organization, tenantId };
};

type OrganizationTabsBeforeLoadArgs = {
  context: { organization: EnrichedOrganization };
  matches: readonly { routeId: string; fullPath: string; params: unknown }[];
};

/** Opens the first tab the organization's bar resolves and forwards away from disabled tabs and the ones the user's grants lack. */
export const organizationTabsBeforeLoad = async ({ context, matches }: OrganizationTabsBeforeLoadArgs): Promise<void> => {
  guardNavTabs(matches, '/_app/$tenantId/$organizationSlug/organization', {
    slotConfig: context.organization.toolsConfig['organization.tabs'],
    grants: await loadChannelTabGrants(context.organization),
  });
};
