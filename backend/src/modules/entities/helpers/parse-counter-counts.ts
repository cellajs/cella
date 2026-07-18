/**
 * Parse the JSONB `counts` column from channelCountersTable into typed maps.
 *
 * Key grammar: prefixed keys are per-entity-type FAMILIES, bare words are org-row
 * SINGLETONS (written by the CDC worker):
 *   sequence        → the org sequence (reservation counter; org rows only)
 *   membership      → membership change signal (bump-only counter, org rows only)
 *   f:{entityType}  → subtree frontier: newest sequence position at or below this node
 *   fs:{entityType} → self frontier: newest sequence position of rows HOMED at this node
 *   e:{entityType}  → subtree entity count (full attribution)
 *   es:{entityType} → self entity count (rows homed at this node)
 *   m:{role}        → membership count by role (handled elsewhere)
 *   li:{entityType} → epoch ms of latest live post in the channel's own stream (handled elsewhere)
 *   lu:{entityType} → epoch ms of latest live-row content update in that stream (handled elsewhere)
 */
export function parseCounterCounts(counts: Record<string, unknown> | null | undefined) {
  const entityCounts: Record<string, number> = {};
  const frontiers: Record<string, number> = {};
  const selfCounts: Record<string, number> = {};
  const selfFrontiers: Record<string, number> = {};
  let sequence: number | undefined;
  let membership: number | undefined;

  if (counts) {
    for (const [key, value] of Object.entries(counts)) {
      if (typeof value !== 'number') continue;
      if (key === 'sequence') sequence = value;
      else if (key === 'membership') membership = value;
      else if (key.startsWith('fs:')) selfFrontiers[key.slice(3)] = value;
      else if (key.startsWith('es:')) selfCounts[key.slice(3)] = value;
      else if (key.startsWith('e:')) entityCounts[key.slice(2)] = value;
      else if (key.startsWith('f:')) frontiers[key.slice(2)] = value;
    }
  }

  return { sequence, membership, entityCounts, frontiers, selfCounts, selfFrontiers };
}
