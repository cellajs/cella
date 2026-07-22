/**
 * Parses channel counter JSON into typed singleton and per-entity maps.
 * The `e` domain contains entity metrics, `m` contains membership metrics, and an `h`
 * segment marks a home-only summary. Activity and membership counts are parsed elsewhere.
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
