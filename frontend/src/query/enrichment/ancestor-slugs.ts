import type { MembershipBase } from 'sdk';
import { appConfig, type ChannelEntityType } from 'shared';
import type { AncestorSlugs } from '~/modules/entities/types';
import type { EnrichableEntity } from '~/query/enrichment/types';
import { getField } from '~/utils/get-field';

/** entityType -> entityId -> slug */
export type SlugIndex = Map<string, Map<string, string>>;

/** Check if ancestor slugs maps differ */
function hasAncestorSlugsChanged(a: AncestorSlugs | null, b: AncestorSlugs | null): boolean {
  if (!a && !b) return false;
  if (!a || !b) return true;
  const aKeys = Object.keys(a) as ChannelEntityType[];
  if (aKeys.length !== Object.keys(b).length) return true;
  return aKeys.some((k) => a[k] !== b[k]);
}

/**
 * Enrich an item with ancestor slugs using a pre-built slug index.
 * Falls back to ancestor ID when slug isn't indexed; rewriteUrlToSlug corrects the URL later.
 * Returns the original reference when nothing changed.
 */
export function enrichWithAncestorSlugs(
  item: EnrichableEntity,
  ancestors: readonly ChannelEntityType[],
  slugIndex: SlugIndex,
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
    slugs[ancestorType] = slugIndex.get(ancestorType)?.get(ancestorId) ?? ancestorId;
    found = true;
  }

  if (!found) return item;
  if (!hasAncestorSlugsChanged(item.ancestorSlugs ?? null, slugs)) return item;

  return { ...item, ancestorSlugs: slugs };
}
