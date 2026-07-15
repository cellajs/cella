import { useParams } from '@tanstack/react-router';
import { appConfig } from 'shared';
import { entityRouteConfig } from '~/routes-config';

/**
 * Returns a stable key for the deepest context entity in the current route, a composite of every
 * present context entity slug param (e.g. the organization slug, or a fork's nested project slug).
 * Returns `undefined` on pages that aren't scoped to a context entity.
 *
 * Re-triggers the page-enter mask once per context entity navigation, without coupling to any
 * specific entity type. Tab switches within the same entity don't change the key.
 */
export const usePageEntityKey = (): string | undefined => {
  const params = useParams({ strict: false }) as Record<string, string | undefined>;

  const parts = appConfig.channelEntityTypes
    .map((type) => params[entityRouteConfig[type]?.paramName ?? ''])
    .filter((value): value is string => !!value);

  return parts.length ? parts.join('/') : undefined;
};
