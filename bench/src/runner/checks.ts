import type { Distribution } from './metrics';
import { count, ms } from './report';
import type { CheckResult, Checks, Stat } from './types';

/** What the checks read of a finished run. */
export interface CheckInput {
  counters: Record<string, number>;
  distributions: Record<string, Distribution>;
  short: boolean;
}

const DEFAULT_MAX_REJECTED_SHARE = 1;
const STATS = new Set<string>(['p50', 'p95', 'p99', 'max', 'min', 'mean']);

const pct = (n: number) => `${n.toFixed(1)}%`;

/** `http.codes.<status>` counters by status. */
function statusCounts(counters: Record<string, number>): [string, number][] {
  return Object.entries(counters)
    .flatMap(([name, n]): [string, number][] => {
      const status = /^http\.codes\.(\d{3})$/.exec(name)?.[1];
      return status ? [[status, n]] : [];
    })
    .sort(([a], [b]) => a.localeCompare(b));
}

/**
 * Evaluates a scenario's checks. The rejected-response check always runs, short runs included: the latency of a 401
 * says nothing about the endpoint. A short run skips thresholds and `expect`.
 */
export function evaluateChecks(checks: Checks<string, string>, { counters, distributions, short }: CheckInput): CheckResult[] {
  const results: CheckResult[] = [];

  const byStatus = statusCounts(counters);
  const responses = byStatus.reduce((sum, [, n]) => sum + n, 0);
  const rejected = byStatus.filter(([status]) => !status.startsWith('2'));
  const rejectedCount = rejected.reduce((sum, [, n]) => sum + n, 0);
  const maxRejected = checks.maxRejectedShare ?? DEFAULT_MAX_REJECTED_SHARE;
  if (responses > 0) {
    const ok = rejectedCount <= (responses * maxRejected) / 100;
    const detail = rejected.length ? ` (${rejected.map(([status, n]) => `${status} ×${n}`).join(', ')})` : '';
    results.push({
      id: 'responses',
      ok,
      text: `${count(rejectedCount)} of ${count(responses)} responses not 2xx, ${pct((rejectedCount / responses) * 100)} ${ok ? '≤' : '>'} ${maxRejected}%${detail}`,
    });
  }

  if (checks.maxErrorRate !== undefined) {
    const created = counters['vusers.created'] ?? 0;
    const completed = counters['vusers.completed'] ?? 0;
    const rate = created === 0 ? 0 : ((created - completed) / created) * 100;
    const ok = rate <= checks.maxErrorRate;
    results.push({
      id: 'errorRate',
      ok,
      text: `VU failures ${pct(rate)} ${ok ? '≤' : '>'} ${checks.maxErrorRate}% (${count(created - completed)} of ${count(created)})`,
    });
  }

  if (!short) {
    for (const [key, limit] of Object.entries(checks.thresholds ?? {})) {
      if (limit === undefined) continue;
      const dot = key.lastIndexOf('.');
      const name = key.slice(0, dot);
      const stat = key.slice(dot + 1);
      const value = STATS.has(stat) ? distributions[name]?.[stat as Stat] : undefined;
      if (value === undefined) {
        results.push({ id: 'threshold', ok: false, text: `${key}: nothing recorded` });
        continue;
      }
      const ok = value <= limit;
      results.push({ id: 'threshold', ok, text: `${key} ${ms(value)} ${ok ? '≤' : '>'} ${ms(limit)}` });
    }
    for (const name of checks.expect ?? []) {
      const n = counters[name] ?? 0;
      results.push({ id: 'expect', ok: n > 0, text: n > 0 ? `${name} counted ${count(n)}` : `${name} stayed at 0` });
    }
  }

  for (const name of checks.forbid ?? []) {
    const n = counters[name] ?? 0;
    results.push({ id: 'forbid', ok: n === 0, text: n === 0 ? `${name} stayed at 0` : `${name} counted ${count(n)}` });
  }

  return results;
}
