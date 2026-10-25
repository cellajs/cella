import { useParams } from '@tanstack/react-router';
import type { UserMenuItem } from '~/modules/me/types';
import { channelRouteConfig } from '~/routes-config';

/** The id of the organization among `organizations` whose pages are open, matched on its route param: a slug or an id. */
export function useRouteOrganizationId(organizations: UserMenuItem[]): string | undefined {
  const params = useParams({ strict: false }) as Record<string, string | undefined>;
  const idOrSlug = params[channelRouteConfig.organization.paramName];
  if (!idOrSlug) return undefined;

  return organizations.find((item) => item.tenantId === params.tenantId && (item.slug === idOrSlug || item.id === idOrSlug))?.id;
}
