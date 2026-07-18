/**
 * Parse the JSONB `counts` column from channelCountersTable into typed maps.
 *
 * JSONB key conventions (written by CDC worker):
 *   s:ledger        → org-ledger reservation counter (org rows only)
 *   s:membership    → org membership change signal
 *   f:{entityType} → subtree frontier: max ledger seq of that type at or below this node
 *   fs:{entityType}→ self frontier: max ledger seq of rows HOMED at this node
 *   e:{entityType}  → subtree entity count (full attribution)
 *   es:{entityType} → self entity count (rows homed at this node)
 *   m:{role}        → membership count by role (handled elsewhere)
 *   li:{entityType} → epoch ms of latest live post in the context's own stream (handled elsewhere)
 *   lu:{entityType} → epoch ms of latest live-row content update in that stream (handled elsewhere)
 */
export function parseCounterCounts(counts: Record<string, unknown> | null | undefined) {
  const entitySeqs: Record<string, number> = {};
  const entityCounts: Record<string, number> = {};
  const frontiers: Record<string, number> = {};
  const selfCounts: Record<string, number> = {};
  const selfFrontiers: Record<string, number> = {};

  if (counts) {
    for (const [key, value] of Object.entries(counts)) {
      if (typeof value !== 'number') continue;
      if (key.startsWith('fs:')) selfFrontiers[key.slice(3)] = value;
      else if (key.startsWith('es:')) selfCounts[key.slice(3)] = value;
      else if (key.startsWith('s:')) entitySeqs[key.slice(2)] = value;
      else if (key.startsWith('e:')) entityCounts[key.slice(2)] = value;
      else if (key.startsWith('f:')) frontiers[key.slice(2)] = value;
    }
  }

  return { entitySeqs, entityCounts, frontiers, selfCounts, selfFrontiers };
}
