import type { MembershipBase } from 'sdk';
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
  const resolved = findMembership(memberships, item.id) ?? existing;

  if (resolved === null || !hasMembershipChanged(existing, resolved)) return item;

  return { ...item, membership: resolved };
}
