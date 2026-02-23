import type { EntityCanMap } from 'shared';
import { accessPolicies, type ContextEntityType, computeCan } from 'shared';
import type { EnrichableEntity } from '~/query/enrichment/types';

/** Deep-compare two EntityCanMap objects */
function hasCanChanged(a: EntityCanMap | undefined, b: EntityCanMap | undefined): boolean {
  if (!a && !b) return false;
  if (!a || !b) return true;

  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return true;

  return aKeys.some((key) => {
    const aPerms = a[key as ContextEntityType];
    const bPerms = b[key as ContextEntityType];
    if (!aPerms && !bPerms) return false;
    if (!aPerms || !bPerms) return true;
    return Object.keys(aPerms).some(
      (action) => aPerms[action as keyof typeof aPerms] !== bPerms[action as keyof typeof bPerms],
    );
  });
}

/**
 * Enrich an item with computed permissions from its membership.
 * Computes a permission map keyed by entity type (self + descendants per hierarchy).
 * Returns the original reference when nothing changed.
 */
export function enrichWithPermissions(item: EnrichableEntity, contextType: ContextEntityType): EnrichableEntity {
  const membership = item.membership ?? null;
  const existing = item.can;

  const computed = computeCan(contextType, membership, accessPolicies);

  if (!hasCanChanged(existing, computed)) return item;

  return { ...item, can: computed };
}
