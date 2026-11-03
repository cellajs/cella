import { scrubSecretLines } from '../../boot/src/diagnostics';

/** Where runs are kept in the environment's diagnostics bucket: one folder per run, `runs/<run>/`. */
export const RUNS_PREFIX = 'runs/';

/** One step of a run, as the record keeps it. */
export interface RunStep {
  title: string;
  seconds: number;
  outcome: 'ok' | 'error';
}

/** How a run ended; `running` while it runs. Blocked: identities, a privileged change or a required secret is owed, which the operator settles. */
export type RunOutcome = 'running' | 'deployed' | 'blocked' | 'failed';

/** A new machine's account of the run's release (C16): its key under `boot-diag/`, or none when that machine never uploaded one. */
export interface RunBootAccount {
  service: string;
  key?: string;
  failed?: boolean;
}

/** One run, one record (plan §3.8): what it deployed where, each step with its duration, the step that failed, and how it ended. */
export interface RunRecord {
  run: string;
  environment: string;
  target: string;
  startedAt: string;
  endedAt?: string;
  outcome: RunOutcome;
  steps: RunStep[];
  failedStep?: string;
  error?: string;
  /** Set when the rollout failed: each service's account of the release, which Show runs prints for a failed boot. */
  boot?: RunBootAccount[];
}

/** A run's id: when it started and what it deploys, so ids sort by time and say their target (`20261015T002000Z-21bae33f7c`). */
export function runId(sha: string, now = new Date()): string {
  return `${now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+Z$/, 'Z')}-${sha.slice(0, 10)}`;
}

/** The record's key in the diagnostics bucket. */
export function runRecordKey(run: string): string {
  return `${RUNS_PREFIX}${run}/record.json`;
}

/** The key of the log beside the record. */
export function runLogKey(run: string): string {
  return `${RUNS_PREFIX}${run}/log`;
}

/**
 * Keeps a run's record and log while it runs. Every line goes through the same scrub as a machine's boot log before it is kept, and the
 * error a run ends with does too: a record holds nothing secret.
 */
export class RunRecorder {
  private readonly current: RunRecord;
  private readonly lines: string[] = [];

  constructor(init: { run: string; environment: string; target: string; now?: Date }) {
    this.current = {
      run: init.run,
      environment: init.environment,
      target: init.target,
      startedAt: (init.now ?? new Date()).toISOString(),
      outcome: 'running',
      steps: [],
    };
  }

  /** Keep one line of the run's log. */
  line(text: string): void {
    this.lines.push(scrubSecretLines(text));
  }

  /** Keep a step's end; the first step that failed is the record's failing step. */
  step(title: string, seconds: number, outcome: RunStep['outcome']): void {
    this.current.steps.push({ title, seconds, outcome });
    if (outcome === 'error') this.current.failedStep ??= title;
  }

  /** Name the release's boot accounts, once the rollout failed. */
  boot(accounts: RunBootAccount[]): void {
    this.current.boot = accounts;
  }

  /** End the run. */
  finish(outcome: Exclude<RunOutcome, 'running'>, error?: string, now = new Date()): void {
    this.current.outcome = outcome;
    this.current.endedAt = now.toISOString();
    if (error) this.current.error = scrubSecretLines(error);
  }

  record(): RunRecord {
    return { ...this.current, steps: [...this.current.steps], ...(this.current.boot ? { boot: [...this.current.boot] } : {}) };
  }

  log(): string {
    return `${this.lines.join('\n')}\n`;
  }
}

/** One version of a record or a log as the versioned bucket keeps it, in the order written; `body` is absent for a delete marker. */
export interface StoredVersion<T> {
  at: string;
  body?: T;
}

/** The first version that broke the chain of versions growing from the first: when it was written and what it changed. */
export interface Rewrite {
  at: string;
  detail: string;
}

/** What a run's versions say: the newest version that grows the chain from the first, and the version that broke it when one did. */
export interface Growth<T> {
  newest: T;
  rewrite?: Rewrite;
}

/**
 * Read a record or a log by its first version: the deploy rewrites both after every step and nothing else writes them, so each version
 * grows the one before it. The reading is the newest version on that chain; the first version off it is named as a rewrite, as only a key
 * that may write the bucket (the deploy key or a stolen copy) wrote it. Undefined without a version that has a body.
 * @param grows what `next` changed of `prev`, or undefined when it only grew it.
 */
export function readByGrowth<T>(versions: readonly StoredVersion<T>[], grows: (prev: T, next: T) => string | undefined): Growth<T> | undefined {
  const first = versions.find((version) => version.body !== undefined);
  if (first?.body === undefined) return undefined;
  let newest = first.body;
  for (const version of versions.slice(versions.indexOf(first) + 1)) {
    const { body } = version;
    if (body === undefined) return { newest, rewrite: { at: version.at, detail: 'deleted the record' } };
    const detail = grows(newest, body);
    if (detail !== undefined) return { newest, rewrite: { at: version.at, detail } };
    newest = body;
  }
  return { newest };
}

/** What a later version of a record changed of an earlier one, or undefined when it only added steps, the boot accounts or the end. */
export function recordGrows(prev: RunRecord, next: RunRecord): string | undefined {
  for (const key of ['run', 'environment', 'target', 'startedAt'] as const) if (prev[key] !== next[key]) return `changed ${key}`;
  for (const [index, step] of prev.steps.entries()) {
    const later = next.steps[index];
    if (!later) return `dropped step "${step.title}"`;
    if (later.title !== step.title || later.seconds !== step.seconds || later.outcome !== step.outcome) return `changed step "${step.title}"`;
  }
  if (prev.failedStep && next.failedStep !== prev.failedStep) return 'changed the failed step';
  if (prev.boot && JSON.stringify(next.boot) !== JSON.stringify(prev.boot)) return 'changed the boot accounts';
  if (prev.outcome === 'running') return undefined;
  if (next.outcome !== prev.outcome) return `changed the outcome from ${prev.outcome} to ${next.outcome}`;
  if (next.steps.length !== prev.steps.length) return 'added a step after the end';
  if (next.endedAt !== prev.endedAt || next.error !== prev.error) return 'changed the end';
  return undefined;
}

/** What a later version of a log changed of an earlier one, or undefined when it only appended lines. */
export function logGrows(prev: string, next: string): string | undefined {
  return next.startsWith(prev) ? undefined : 'changed the log';
}

/** The rewrite, said for a list line or a status check. */
export function rewriteNote(rewrite: Rewrite): string {
  return `rewritten: the version at ${rewrite.at.slice(0, 16).replace('T', ' ')} ${rewrite.detail}`;
}

/** One line per run for a list: when, what, how it ended, and where it stopped. */
export function runSummaryLine(record: RunRecord): string {
  const seconds = record.endedAt ? Math.round((Date.parse(record.endedAt) - Date.parse(record.startedAt)) / 1000) : undefined;
  const took = seconds === undefined ? '' : ` in ${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, '0')}s`;
  const where = record.failedStep ? ` at "${record.failedStep}"` : '';
  return `${record.startedAt.slice(0, 16).replace('T', ' ')}  ${record.environment}  ${record.target.slice(0, 10)}  ${record.outcome}${where}${took}`;
}
