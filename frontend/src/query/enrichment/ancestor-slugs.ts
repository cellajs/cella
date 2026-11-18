import { type ChannelEntityType, hierarchy } from 'shared';
import { asRecord } from 'shared/utils/as-record';
import type { AncestorSlugs } from '~/modules/entities/types';
import type { EnrichableChannel } from '~/query/enrichment/types';
import { objectKeys } from '~/utils/object-keys';

/** entityType -> entityId -> slug */
export type SlugIndex = Map<ChannelEntityType, Map<string, string>>;

function hasAncestorSlugsChanged(a: AncestorSlugs | null, b: AncestorSlugs | null): boolean {
  if (!a && !b) return false;
  if (!a || !b) return true;
  const aKeys = objectKeys(a);
  if (aKeys.length !== Object.keys(b).length) return true;
  return aKeys.some((type) => a[type] !== b[type]);
}

/**
 * Reads each ancestor id from the row's id columns, which a channel row always carries, as the permission engine refuses
 * one without them. Reads a pre-built index, falling back to the ancestor id when a slug is not indexed; rewriteUrlToSlug
 * corrects the URL later.
 */
export function enrichWithAncestorSlugs(item: EnrichableChannel, entityType: ChannelEntityType, slugIndex: SlugIndex): EnrichableChannel {
  const ancestors = hierarchy.resolveNonNullAncestors(entityType, asRecord(item));
  if (ancestors.length === 0) return item;

  const slugs: AncestorSlugs = {};
  for (const { type, id } of ancestors) slugs[type] = slugIndex.get(type)?.get(id) ?? id;

  if (!hasAncestorSlugsChanged(item.ancestorSlugs ?? null, slugs)) return item;

  return { ...item, ancestorSlugs: slugs };
}
