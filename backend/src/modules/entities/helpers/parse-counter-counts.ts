import { frontierPrefix, signalVersionPrefix } from '#/modules/entities/counter-keys';

/**
 * Sorts the keys of an organization's counter row by what they mean to the API. The `e` key domain holds entity
 * metrics, `m` membership metrics and `s` signal versions. Entity counts, activity stamps and membership counts are
 * parsed elsewhere, and the sequence counter is the CDC worker's alone.
 * @param counts - The `counts` of a `channel_counters` row.
 * @returns The versions of the organization's versioned signals by type, and its frontier per entity type.
 */
export function parseCounterCounts(counts: Record<string, unknown> | null | undefined) {
  const frontiers: Record<string, number> = {};
  const signals: Record<string, number> = {};

  if (counts) {
    for (const [key, value] of Object.entries(counts)) {
      if (typeof value !== 'number') continue;
      if (key.startsWith(signalVersionPrefix)) signals[key.slice(signalVersionPrefix.length)] = value;
      else if (key.startsWith(frontierPrefix)) frontiers[key.slice(frontierPrefix.length)] = value;
    }
  }

  return { signals, frontiers };
}
