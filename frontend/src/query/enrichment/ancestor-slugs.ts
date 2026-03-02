import { appConfig, type ContextEntityType } from 'shared';
import type { MembershipBase } from '~/api.gen';
import type { AncestorSlugs } from '~/modules/entities/types';
import { getEntityQueryKeys } from '~/query/basic';
import { getField } from '~/query/enrichment/helpers';
import type { EnrichableEntity, InfiniteData } from '~/query/enrichment/types';
import { queryClient } from '~/query/query-client';

/** Find an entity's slug by scanning list caches for that entity type */
function findEntitySlugInCache(entityType: ContextEntityType, entityId: string): string | null {
  const keys = getEntityQueryKeys(entityType);

  for (const [, data] of queryClient.getQueriesData<InfiniteData>({ queryKey: keys.list.base })) {
    if (!data?.pages) continue;
    for (const page of data.pages) {
      const found = page.items?.find((item) => item.id === entityId);
      if (found?.slug) return found.slug;
    }
  }
  return null;
}

/** Check if ancestor slugs maps differ */
function hasAncestorSlugsChanged(a: AncestorSlugs | null, b: AncestorSlugs | null): boolean {
  if (!a && !b) return false;
  if (!a || !b) return true;
  const aKeys = Object.keys(a) as ContextEntityType[];
  if (aKeys.length !== Object.keys(b).length) return true;
  return aKeys.some((k) => a[k] !== b[k]);
}

/**
 * Enrich an item with ancestor slugs by walking up the hierarchy config.
 * Falls back to ancestor ID when slug isn't cached — rewriteUrlToSlug corrects the URL later.
 * Returns the original reference when nothing changed.
 */
export function enrichWithAncestorSlugs(
  item: EnrichableEntity,
  ancestors: readonly ContextEntityType[],
): EnrichableEntity {
  if (ancestors.length === 0) return item;

  const membership: MembershipBase | null = item.membership ?? null;
  const slugs: AncestorSlugs = {};
  let found = false;

  for (const ancestorType of ancestors) {
    const idKey = appConfig.entityIdColumnKeys[ancestorType];
    if (!idKey) continue;
    const ancestorId = getField(membership, idKey) ?? getField(item, idKey);
    if (typeof ancestorId !== 'string') continue;
    slugs[ancestorType] = findEntitySlugInCache(ancestorType, ancestorId) ?? ancestorId;
    found = true;
  }

  if (!found) return item;
  if (!hasAncestorSlugsChanged(item.ancestorSlugs ?? null, slugs)) return item;

  return { ...item, ancestorSlugs: slugs };
}
