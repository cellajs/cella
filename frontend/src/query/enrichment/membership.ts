import type { MembershipBase } from 'sdk';
import { findMembership } from '~/query/enrichment/helpers';
import type { EnrichableChannel } from '~/query/enrichment/types';

/** Fields that affect enrichment; update when MembershipBase gains new meaningful fields. */
const comparedKeys: (keyof MembershipBase)[] = ['archived', 'muted', 'displayOrder', 'role'];

function hasMembershipChanged(a: MembershipBase | null, b: MembershipBase | null): boolean {
  if (!a && !b) return false;
  if (!a || !b) return true;
  return comparedKeys.some((key) => a[key] !== b[key]);
}

export function enrichWithMembership(item: EnrichableChannel, memberships: MembershipBase[]): EnrichableChannel {
  const existing = item.membership ?? null;
  const resolved = findMembership(memberships, item.id) ?? existing;

  if (resolved === null || !hasMembershipChanged(existing, resolved)) return item;

  return { ...item, membership: resolved };
}

/** Sets `invited` from the invites list; leaves the row as is while that list is not loaded. */
export function enrichWithInvitation(item: EnrichableChannel, invitedIds: ReadonlySet<string> | null): EnrichableChannel {
  if (!invitedIds) return item;
  const invited = invitedIds.has(item.id);
  return !!item.invited === invited ? item : { ...item, invited };
}
