/**
 * Parse the JSONB `counts` column from channelCountersTable into typed maps.
 *
 * JSONB key conventions (written by CDC worker):
 *   s:{entityType}  → entity seq (monotonic update counter)
 *   e:{entityType}  → entity count
 *   m:{role}        → membership count by role (handled elsewhere)
 *   li:{entityType} → epoch ms of latest live post in the context's own stream (handled elsewhere)
 *   lu:{entityType} → epoch ms of latest live-row content update in that stream (handled elsewhere)
 */
export function parseCounterCounts(counts: Record<string, unknown> | null | undefined) {
  const entitySeqs: Record<string, number> = {};
  const entityCounts: Record<string, number> = {};

  if (counts) {
    for (const [key, value] of Object.entries(counts)) {
      if (typeof value !== 'number') continue;
      if (key.startsWith('s:')) entitySeqs[key.slice(2)] = value;
      else if (key.startsWith('e:')) entityCounts[key.slice(2)] = value;
    }
  }

  return { entitySeqs, entityCounts };
}
