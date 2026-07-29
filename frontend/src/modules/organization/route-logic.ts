import { getOrganization } from 'sdk';
import {
  findOrganizationByIdOrSlug,
  organizationQueryKeys,
  organizationQueryOptions,
} from '~/modules/organization/query';
import { resolveChannelBySlug } from '~/query/basic/resolve-channel-by-slug';

type OrganizationLayoutBeforeLoadArgs = {
  params: { tenantId: string; organizationSlug: string };
  cause: 'preload' | 'enter' | 'stay';
};

/** Loads and authorizes the organization route context. */
export const organizationLayoutBeforeLoad = async ({ params, cause }: OrganizationLayoutBeforeLoadArgs) => {
  // TODO [#12] Revalidate on initial entry; child useSuspenseQuery handles search param changes.
  const shouldRevalidate = cause === 'enter';

  const { tenantId, organizationSlug } = params;

  const organization = await resolveChannelBySlug({
    idOrSlug: organizationSlug,
    tenantId,
    findInCache: findOrganizationByIdOrSlug,
    detailQueryOptions: (id) => organizationQueryOptions(id, tenantId),
    fetchBySlug: () =>
      getOrganization({ path: { tenantId, id: organizationSlug }, query: { slug: true, include: 'counts' } }),
    slugFetchCacheKey: organizationQueryKeys.detail.byId,
    ensureRequiresOnline: false,
    revalidateIfStale: shouldRevalidate,
    params,
    buildSlugOverrides: (entity) => ({ tenantId, organizationSlug: entity.slug }),
    routeTo: '/$tenantId/$organizationSlug',
  });

  return { organization, tenantId };
};
