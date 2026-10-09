/**
 * Sorts the keys of a counter row by what they mean to the API. The `e` key domain holds entity metrics, `m`
 * membership metrics, and an `h` segment marks a home-only summary. Activity stamps and membership counts are parsed
 * elsewhere, and the sequence counter is the CDC worker's alone.
 * @param counts - The `counts` of a `channel_counters` row.
 * @returns The membership signal, and per entity type the counts and frontiers of the subtree and of the home.
 */
export function parseCounterCounts(counts: Record<string, unknown> | null | undefined) {
  const entityCounts: Record<string, number> = {};
  const frontiers: Record<string, number> = {};
  const selfCounts: Record<string, number> = {};
  const selfFrontiers: Record<string, number> = {};
  let membership: number | undefined;

  if (counts) {
    for (const [key, value] of Object.entries(counts)) {
      if (typeof value !== 'number') continue;
      if (key === 'membership') membership = value;
      else if (key.startsWith('e:f:h:')) selfFrontiers[key.slice(6)] = value;
      else if (key.startsWith('e:f:')) frontiers[key.slice(4)] = value;
      else if (key.startsWith('e:c:h:')) selfCounts[key.slice(6)] = value;
      else if (key.startsWith('e:c:')) entityCounts[key.slice(4)] = value;
    }
  }

  return { membership, entityCounts, frontiers, selfCounts, selfFrontiers };
}
