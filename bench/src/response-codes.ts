/** Above this share of non-2xx responses a run times rejections, not its endpoints. */
const MAX_REJECTED_SHARE = 0.01;

/**
 * Why a run's responses disqualify it, or null when they do not. Reads the counters of an Artillery report:
 * `http.codes.*` from its HTTP engine, and `fetch.codes.*` from processors that call fetch themselves.
 */
export function rejectedResponses(counters: Record<string, number>): string | null {
  const byStatus = new Map<string, number>();
  for (const [name, count] of Object.entries(counters)) {
    const status = /^(?:http|fetch)\.codes\.(\d{3})$/.exec(name)?.[1];
    if (status) byStatus.set(status, (byStatus.get(status) ?? 0) + count);
  }

  const total = [...byStatus.values()].reduce((sum, count) => sum + count, 0);
  const rejected = [...byStatus].filter(([status]) => !status.startsWith('2')).sort(([a], [b]) => a.localeCompare(b));
  const rejectedCount = rejected.reduce((sum, [, count]) => sum + count, 0);
  if (rejectedCount <= total * MAX_REJECTED_SHARE) return null;

  return `${rejectedCount} of ${total} responses were not 2xx (${rejected.map(([status, count]) => `${status} ×${count}`).join(', ')})`;
}
