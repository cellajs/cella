import process from 'node:process';
import { stripVTControlCharacters, styleText } from 'node:util';
import { type BaselineEntry, compareBaseline, RUNNER_EPOCH } from './baseline';
import type { Distribution, EndpointSummary } from './metrics';
import type { CheckResult } from './types';

type Color = 'green' | 'red' | 'yellow' | 'cyan' | 'dim' | 'bold';
export const paint = (color: Color, text: string) => styleText(color, text);

const visible = (text: string) => stripVTControlCharacters(text).length;

export const count = (n: number) => Math.round(n).toLocaleString('en-US');

/** Milliseconds, one decimal below 10. */
export const ms = (n: number) => (n < 10 ? `${n.toFixed(1)}ms` : `${Math.round(n)}ms`);

const seconds = (n: number) => `${Math.round(n)}s`;

/**
 * The live block at the bottom of the output. On a terminal each render replaces the previous block and `log` prints
 * above it; piped output gets every render appended, so a log file holds the whole run.
 */
export class LiveDisplay {
  private rows = 0;
  private lines: string[] = [];

  constructor(
    private readonly tty: boolean,
    private readonly out: NodeJS.WriteStream = process.stdout,
  ) {}

  render(lines: string[]): void {
    this.lines = lines;
    if (!this.tty) {
      for (const line of lines) this.out.write(`${line}\n`);
      return;
    }
    this.clear();
    this.draw();
  }

  log(text: string): void {
    if (!this.tty) {
      this.out.write(`${text}\n`);
      return;
    }
    this.clear();
    this.out.write(`${text}\n`);
    this.draw();
  }

  /** Removes the block from a terminal; piped output keeps what it printed. */
  clear(): void {
    if (this.rows > 0) this.out.write(`\x1b[${this.rows}F\x1b[J`);
    this.rows = 0;
  }

  private draw(): void {
    const columns = this.out.columns || 80;
    for (const line of this.lines) this.out.write(`${line}\n`);
    this.rows = this.lines.reduce((sum, line) => sum + Math.max(1, Math.ceil(visible(line) / columns)), 0);
  }
}

export interface LiveState {
  scenario: string;
  phase: string;
  elapsedS: number;
  /** Seconds the phases take; null for a single-run scenario. */
  plannedS: number | null;
  vus: { started: number; active: number; completed: number; failed: number };
  intervalS: number;
  counters: Record<string, number>;
  http?: Distribution;
  primary?: { name: string; distribution: Distribution };
  /** Interval deltas of the scenario's own counters. */
  custom: [string, number][];
  lagP99: number;
}

export function liveLines(state: LiveState): string[] {
  const { vus, counters } = state;
  const time = state.plannedS === null ? seconds(state.elapsedS) : `${seconds(state.elapsedS)}/${seconds(state.plannedS)}`;
  const head = `${paint('bold', state.scenario)} ${paint('dim', `· ${state.phase} · ${time}`)}`;

  const parts = [
    `vus +${count(vus.started)} ▸${count(vus.active)} ✓${count(vus.completed)} ${vus.failed > 0 ? paint('red', `✗${count(vus.failed)}`) : '✗0'}`,
  ];
  const requests = counters['http.requests'] ?? 0;
  if (requests > 0 || state.http) {
    parts.push(`${count(requests / state.intervalS)} req/s`);
    if (state.http) parts.push(`p50 ${ms(state.http.p50)} p95 ${ms(state.http.p95)} p99 ${ms(state.http.p99)}`);
    const classes = new Map<string, number>();
    for (const [name, n] of Object.entries(counters)) {
      const status = /^http\.codes\.(\d)\d\d$/.exec(name)?.[1];
      if (status) classes.set(`${status}xx`, (classes.get(`${status}xx`) ?? 0) + n);
    }
    const codes = [...classes].sort().map(([cls, n]) => (cls === '2xx' ? `${cls} ${count(n)}` : paint('yellow', `${cls} ${count(n)}`)));
    if (codes.length) parts.push(codes.join(' '));
  }
  const errors = Object.entries(counters).filter(([name]) => name.startsWith('errors.'));
  if (errors.length) parts.push(paint('red', errors.map(([name, n]) => `${name.slice(7)} ${count(n)}`).join(' ')));
  if (state.primary) {
    const d = state.primary.distribution;
    parts.push(`${state.primary.name} p50 ${ms(d.p50)} p95 ${ms(d.p95)}`);
  }
  for (const [name, n] of state.custom) parts.push(`${name} +${count(n)}`);
  parts.push(paint('dim', `gen lag ${ms(state.lagP99)}`));
  return [head, `  ${parts.join(paint('dim', ' · '))}`];
}

export interface SummaryView {
  scenario: string;
  durationS: number;
  short: boolean;
  vus: { created: number; completed: number; failed: number };
  requests: number;
  requestRate: number;
  http?: Distribution;
  endpoints: Record<string, EndpointSummary>;
  histograms: Record<string, Distribution>;
  counters: [string, number][];
  errors: Record<string, { count: number; message: string }>;
  checks: CheckResult[];
  /** False for a short or failed run: neither is compared. */
  compared: boolean;
  baseline: BaselineEntry | null;
  olderBaselines: number;
  current: BaselineEntry;
  saved: number | null;
  logFile: string;
  lagWarning: string | null;
}

const pad = (text: string, width: number, left = false) => (left ? text.padEnd(width) : text.padStart(width));

function deltaText(pct: number | null, lowerIsBetter: boolean): string {
  if (pct === null) return paint('dim', 'n/a');
  if (Math.abs(pct) < 1) return paint('dim', '~0%');
  const label = `${pct > 0 ? '+' : '−'}${Math.abs(pct).toFixed(0)}%`;
  return (lowerIsBetter ? pct < 0 : pct > 0) ? paint('green', label) : paint('red', label);
}

/** The end-of-run report: per-endpoint table, custom histograms and counters, checks, baseline delta and log path. */
export function summaryLines(view: SummaryView): string[] {
  const lines: string[] = [];
  const vus = `${count(view.vus.created)} VUs (✓${count(view.vus.completed)} ✗${count(view.vus.failed)})`;
  const reqs = view.requests > 0 ? ` · ${count(view.requests)} requests · ${count(view.requestRate)} req/s` : '';
  lines.push(`${paint('bold', view.scenario)}${view.short ? paint('dim', ' (short)') : ''} · ${view.durationS.toFixed(1)} s · ${vus}${reqs}`);

  const labels = Object.keys(view.endpoints);
  if (labels.length) {
    const width = Math.max(8, ...labels.map((label) => label.length));
    lines.push(
      paint(
        'dim',
        `  ${pad('endpoint', width, true)} ${pad('req', 8)} ${pad('p50', 8)} ${pad('p95', 8)} ${pad('p99', 8)} ${pad('max', 8)} ${pad('non-2xx', 8)} ${pad('timeouts', 9)}`,
      ),
    );
    for (const [label, e] of Object.entries(view.endpoints)) {
      const d = e.ttfb;
      const nonOk = e.nonOk > 0 ? paint('yellow', pad(count(e.nonOk), 8)) : pad('0', 8);
      const timeouts = e.timeouts > 0 ? paint('red', pad(count(e.timeouts), 9)) : pad('0', 9);
      lines.push(
        `  ${pad(label, width, true)} ${pad(count(e.requests), 8)} ${pad(ms(d.p50), 8)} ${pad(ms(d.p95), 8)} ${pad(ms(d.p99), 8)} ${pad(ms(d.max), 8)} ${nonOk} ${timeouts}`,
      );
      const rejected = Object.entries(e.codes).filter(([code]) => !code.startsWith('2'));
      if (rejected.length) lines.push(paint('dim', `  ${' '.repeat(width)} ${rejected.map(([code, n]) => `${code} ×${count(n)}`).join(', ')}`));
    }
  }

  const histograms = Object.entries(view.histograms);
  if (histograms.length) {
    const width = Math.max(9, ...histograms.map(([name]) => name.length));
    lines.push(
      paint('dim', `  ${pad('histogram', width, true)} ${pad('count', 8)} ${pad('p50', 8)} ${pad('p95', 8)} ${pad('p99', 8)} ${pad('max', 8)}`),
    );
    for (const [name, d] of histograms) {
      lines.push(
        `  ${pad(name, width, true)} ${pad(count(d.count), 8)} ${pad(ms(d.p50), 8)} ${pad(ms(d.p95), 8)} ${pad(ms(d.p99), 8)} ${pad(ms(d.max), 8)}`,
      );
    }
  }

  if (view.counters.length) lines.push(`  ${view.counters.map(([name, n]) => `${name} ${paint('bold', count(n))}`).join(paint('dim', ' · '))}`);
  for (const [code, { count: n, message }] of Object.entries(view.errors)) {
    lines.push(paint('red', `  errors.${code} ${count(n)}${message ? `: ${message}` : ''}`));
  }
  if (view.lagWarning) lines.push(paint('yellow', `  ⚠ ${view.lagWarning}`));

  for (const check of view.checks) lines.push(`  ${check.ok ? paint('green', '✓') : paint('red', '✗')} ${check.text}`);

  if (view.compared) {
    if (view.baseline) {
      const deltas = compareBaseline(view.current, view.baseline).map((d) => `${d.label} ${deltaText(d.pct, d.lowerIsBetter)}`);
      lines.push(`  baseline ${view.baseline.timestamp.slice(0, 16).replace('T', ' ')} (${RUNNER_EPOCH}): ${deltas.join(', ')}`);
    } else {
      const older = view.olderBaselines > 0 ? `, ${view.olderBaselines} older-runner entries kept` : '';
      lines.push(paint('dim', `  no comparable baseline: first ${RUNNER_EPOCH} run${older}`));
    }
    if (view.saved !== null) lines.push(paint('dim', `  baseline saved (${view.saved} run${view.saved === 1 ? '' : 's'})`));
  }
  lines.push(paint('dim', `  log ${view.logFile}`));
  return lines;
}

/** One line per scenario for `--all`: the outcome, the primary latency and what failed. */
export function compactLine(view: SummaryView): string {
  const failed = view.checks.filter((check) => !check.ok);
  const mark = failed.length ? paint('red', '✗') : paint('green', '✓');
  const reqs = view.requests > 0 ? ` · ${count(view.requests)} req · p95 ${ms(view.http?.p95 ?? 0)}` : '';
  const primary = view.current.primary.metric.startsWith('http.') ? '' : ` · ${view.current.primary.metric} ${ms(view.current.primary.value)}`;
  const reasons = failed.length ? paint('red', ` · ${failed.map((check) => check.text).join('; ')}`) : '';
  return `${mark} ${view.scenario}${paint('dim', `${reqs}${primary}`)}${reasons}`;
}
