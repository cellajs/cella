import type { MembershipBase } from '~/api.gen';
import { findMembership } from '~/query/enrichment/helpers';
import type { EnrichableEntity } from '~/query/enrichment/types';

/** Fields that affect enrichment — update when MembershipBase gains new meaningful fields */
const comparedKeys: (keyof MembershipBase)[] = ['archived', 'muted', 'displayOrder', 'role'];

/** Check if two memberships differ on meaningful fields */
function hasMembershipChanged(a: MembershipBase | null, b: MembershipBase | null): boolean {
  if (!a && !b) return false;
  if (!a || !b) return true;
  return comparedKeys.some((k) => a[k] !== b[k]);
}

/**
 * Enrich an item with its membership from the cached memberships array.
 * Returns the original reference when nothing changed.
 */
export function enrichWithMembership(item: EnrichableEntity, memberships: MembershipBase[]): EnrichableEntity {
  const existing = item.membership ?? null;

  // Resolve: memberships array → included fallback → keep existing
  // biome-ignore lint/suspicious/noExplicitAny: included is an optional API response field not on the type
  const resolved = findMembership(memberships, item.id) ?? (item as any).included?.membership ?? null;

  if (resolved === null || !hasMembershipChanged(existing, resolved)) return item;

  return { ...item, membership: resolved };
}
