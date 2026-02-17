import { appConfig, type ContextEntityType } from 'shared';
import type { ContextEntityWithMembership, UserMenu } from '~/modules/me/types';
import { getContextEntityTypeToListQueries } from '~/offline-config';
import { flattenInfiniteData } from '~/query/basic';
import { queryClient } from '~/query/query-client';
import { buildMenu } from './build-menu';

/** Entity types referenced by the menu structure (entity + subentity) */
const menuEntityTypes = Array.from(
  new Set(appConfig.menuStructure.flatMap((s) => [s.entityType, s.subentityType].filter(Boolean))),
) as ContextEntityType[];

/**
 * Reads enriched entity data from the query cache and builds the user menu.
 * Assumes entity lists have already been enriched with memberships by
 * the cache subscriber (initContextEntityEnrichment).
 *
 * Used by both useMenu (reactive) and getMenuData (imperative).
 */
export function buildMenuFromCache(userId: string, opts?: { detailedMenu?: boolean }): UserMenu {
  const registry = getContextEntityTypeToListQueries();
  const byType = new Map<ContextEntityType, ContextEntityWithMembership[]>();

  for (const entityType of menuEntityTypes) {
    const factory = registry[entityType];
    if (!factory) {
      byType.set(entityType, []);
      continue;
    }

    const data = queryClient.getQueryData(factory({ userId }).queryKey);
    // biome-ignore lint/suspicious/noExplicitAny: query data shape is heterogeneous
    const items = data ? flattenInfiniteData<any>(data as any) : [];

    byType.set(
      entityType,
      items.filter((item: any): item is ContextEntityWithMembership => !!item.membership),
    );
  }

  return buildMenu(byType, appConfig.menuStructure, opts);
}

/** The menu entity types used for query subscriptions */
export { menuEntityTypes };
