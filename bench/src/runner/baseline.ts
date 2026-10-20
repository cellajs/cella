import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Marks the entries this runner wrote: an entry without it (Artillery's) stays in the file and is never compared. */
export const RUNNER_EPOCH = 'cella-bench@1';

export interface EndpointBaseline {
  requests: number;
  p50: number;
  p95: number;
  p99: number;
  nonOk: number;
  timeouts: number;
}

/** One passing full run. Latencies in milliseconds, `http.response_time` unless named otherwise. */
export interface BaselineEntry {
  runner: typeof RUNNER_EPOCH;
  timestamp: string;
  scenario: string;
  requests: number;
  requestRate: number;
  mean: number;
  p50: number;
  p95: number;
  p99: number;
  errors: number;
  vusersCreated: number;
  vusersFailed: number;
  /** The latency the scenario chose to compare first, such as `yjs.peer_latency_ms.p95`. */
  primary: { metric: string; value: number };
  endpoints: Record<string, EndpointBaseline>;
}

export interface Delta {
  label: string;
  current: number;
  baseline: number;
  /** Percent change; null when the baseline is zero. */
  pct: number | null;
  lowerIsBetter: boolean;
}

const isComparable = (entry: unknown): entry is BaselineEntry => (entry as { runner?: unknown } | null)?.runner === RUNNER_EPOCH;

function readEntries(file: string): unknown[] {
  if (!existsSync(file)) return [];
  try {
    const data: unknown = JSON.parse(readFileSync(file, 'utf8'));
    return Array.isArray(data) ? data : [data];
  } catch {
    return [];
  }
}

export const baselineFile = (dir: string, scenario: string) => join(dir, 'baselines', `${scenario}.json`);

/** The newest entry of this runner epoch, with the count of older-epoch entries kept beside it. */
export function loadBaseline(dir: string, scenario: string): { baseline: BaselineEntry | null; older: number } {
  const entries = readEntries(baselineFile(dir, scenario));
  const comparable = entries.filter(isComparable);
  return { baseline: comparable.at(-1) ?? null, older: entries.length - comparable.length };
}

/**
 * Appends a run to the scenario's history. A history that does not exist yet starts from `legacyFile`, so the older
 * runner's entries stay readable in one place.
 * @returns How many entries the history holds.
 */
export function saveBaseline(dir: string, entry: BaselineEntry, legacyFile?: string): number {
  const file = baselineFile(dir, entry.scenario);
  const entries = existsSync(file) || !legacyFile ? readEntries(file) : readEntries(legacyFile);
  entries.push(entry);
  mkdirSync(join(dir, 'baselines'), { recursive: true });
  writeFileSync(file, `${JSON.stringify(entries, null, 2)}\n`);
  return entries.length;
}

/** The changes from `baseline` worth a glance: the primary latency first, then the HTTP percentiles and the rate. */
export function compareBaseline(current: BaselineEntry, baseline: BaselineEntry): Delta[] {
  const delta = (label: string, now: number, before: number, lowerIsBetter = true): Delta => ({
    label,
    current: now,
    baseline: before,
    pct: before === 0 ? null : ((now - before) / before) * 100,
    lowerIsBetter,
  });
  const deltas: Delta[] = [];
  if (current.primary.metric === baseline.primary.metric) deltas.push(delta(current.primary.metric, current.primary.value, baseline.primary.value));
  if (current.requests > 0) {
    if (current.primary.metric !== 'http.response_time.p50') deltas.push(delta('p50', current.p50, baseline.p50));
    if (current.primary.metric !== 'http.response_time.p95') deltas.push(delta('p95', current.p95, baseline.p95));
    deltas.push(delta('p99', current.p99, baseline.p99), delta('req/s', current.requestRate, baseline.requestRate, false));
  }
  return deltas;
}
