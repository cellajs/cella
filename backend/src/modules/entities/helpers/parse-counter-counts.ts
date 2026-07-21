/**
 * Parse the JSONB `counts` column from channelCountersTable into typed maps.
 *
 * Key grammar: prefixed keys are per-entity-type FAMILIES, bare words are org-row
 * SINGLETONS (written by the CDC worker). The `e:` domain groups entity metrics and
 * `m:` groups membership metrics; an `h` segment marks a home-only (self) summary:
 *   sequence          → the org sequence (reservation counter; org rows only)
 *   membership        → membership change signal (bump-only counter, org rows only)
 *   e:f:{entityType}  → subtree frontier: newest sequence position at or below this node
 *   e:f:h:{entityType}→ self frontier: newest sequence position of rows HOMED at this node
 *   e:c:{entityType}  → subtree entity count (full attribution)
 *   e:c:h:{entityType}→ self entity count (rows homed at this node)
 *   m:c:{role}        → membership count by role (handled elsewhere)
 *   e:li:h:{entityType} → epoch ms of latest live post in the channel's own stream (handled elsewhere)
 *   e:lu:h:{entityType} → epoch ms of latest live-row content update in that stream (handled elsewhere)
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
      else if (key.startsWith('e:f:h:')) selfFrontiers[key.slice(6)] = value;
      else if (key.startsWith('e:f:')) frontiers[key.slice(4)] = value;
      else if (key.startsWith('e:c:h:')) selfCounts[key.slice(6)] = value;
      else if (key.startsWith('e:c:')) entityCounts[key.slice(4)] = value;
    }
  }

  return { sequence, membership, entityCounts, frontiers, selfCounts, selfFrontiers };
}
