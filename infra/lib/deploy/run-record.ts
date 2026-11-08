import { scrubSecretLines } from '../../agent/src/diagnostics';
import { checkMark, crossMark } from '../utils/cli-output';
import type { JobRun } from './job-runs';

/** Where runs are kept in the environment's diagnostics bucket: one folder per run, `runs/<run>/`. */
export const RUNS_PREFIX = 'runs/';

/** One step of a run, as the record keeps it. */
export interface RunStep {
  title: string;
  seconds: number;
  outcome: 'ok' | 'error';
}

/**
 * How a run ended; `running` while it runs. Unchanged: every role served the target already, under the same retry counter and rotation.
 * Blocked: a required runtime value is missing, which the operator stores. Apply needed: the target describes the app otherwise than the
 * applied engine, and an apply from it publishes its description. A job run ended either way exits blocked.
 */
export type RunOutcome = 'running' | 'deployed' | 'unchanged' | 'blocked' | 'apply needed' | 'failed';

/** A new machine's account of the run's release: its key under `boot-diag/`, or none when that machine never uploaded one. */
export interface RunBootAccount {
  service: string;
  key?: string;
  failed?: boolean;
}

/** One run, one record: what it deployed where, each step with its duration, the step that failed, and how it ended. */
export interface RunRecord {
  run: string;
  environment: string;
  target: string;
  /** The retry counter it deployed the target under; a record from before the counter was kept has none, which reads as 0. */
  retry?: number;
  startedAt: string;
  endedAt?: string;
  outcome: RunOutcome;
  steps: RunStep[];
  failedStep?: string;
  error?: string;
  /** Set when a switch failed: each role's account of the release, which Deploy logs prints for a failed boot. */
  boot?: RunBootAccount[];
}

/** When a run started, to the second, as its id begins (`20261015T002000Z`). */
export function runStamp(now: Date): string {
  return now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+Z$/, 'Z');
}

/** A run's id: when it started and what it deploys, so ids sort by time and say their target (`20261015T002000Z-21bae33f7c`). */
export function runId(sha: string, now = new Date()): string {
  return `${runStamp(now)}-${sha.slice(0, 10)}`;
}

/**
 * The start an id names, to the second: a deploy handed the id of the record its scheduled run opened starts its own record there, so the
 * record grows from the first version. Undefined for an id of another form.
 */
export function runStartedAt(run: string): Date | undefined {
  const parts = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z-/.exec(run);
  return parts ? new Date(`${parts[1]}-${parts[2]}-${parts[3]}T${parts[4]}:${parts[5]}:${parts[6]}Z`) : undefined;
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

  constructor(init: { run: string; environment: string; target: string; retry: number; now?: Date }) {
    this.current = {
      run: init.run,
      environment: init.environment,
      target: init.target,
      retry: init.retry,
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

  /** Name the release's boot accounts, once a switch failed. */
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

/**
 * One version of a record or a log as the versioned bucket keeps it, in the order written: its body, or why it has none (a delete marker
 * when `fault` is unset, else what the body is not).
 */
export interface StoredVersion<T> {
  at: string;
  body?: T;
  fault?: string;
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
 * that may write the bucket (the deploy key or a stolen copy) wrote it, and no version after it is read, so a key that writes thousands
 * costs one read past the break. Undefined without a version that has a body.
 * @param grows what `next` changed of `prev`, or undefined when it only grew it.
 * @param noun what is read, named when a version deleted it (`the record`).
 */
export async function readByGrowth<T>(
  versions: AsyncIterable<StoredVersion<T>> | Iterable<StoredVersion<T>>,
  grows: (prev: T, next: T) => string | undefined,
  noun: string,
): Promise<Growth<T> | undefined> {
  let newest: T | undefined;
  for await (const version of versions) {
    const { body } = version;
    if (newest === undefined) {
      newest = body;
      continue;
    }
    if (body === undefined) return { newest, rewrite: { at: version.at, detail: version.fault ?? `deleted ${noun}` } };
    const detail = grows(newest, body);
    if (detail !== undefined) return { newest, rewrite: { at: version.at, detail } };
    newest = body;
  }
  return newest === undefined ? undefined : { newest };
}

/** True for a value with a record's required fields, what a version of `record.json` must parse to before it is compared. */
export function isRunRecord(value: unknown): value is RunRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    ['run', 'environment', 'target', 'startedAt', 'outcome'].every((key) => typeof record[key] === 'string') &&
    (record.retry === undefined || typeof record.retry === 'number') &&
    Array.isArray(record.steps) &&
    record.steps.every((step) => typeof step?.title === 'string' && typeof step.seconds === 'number' && typeof step.outcome === 'string')
  );
}

/**
 * What a later version of a record changed of an earlier one, or undefined when it only added steps, the boot accounts or the end. The
 * deploy writes an ended record once, so after the end only the same record again grows it.
 */
export function recordGrows(prev: RunRecord, next: RunRecord): string | undefined {
  if (prev.outcome !== 'running') return JSON.stringify(next) === JSON.stringify(prev) ? undefined : 'changed the record after its end';
  for (const key of ['run', 'environment', 'target', 'retry', 'startedAt'] as const) if (prev[key] !== next[key]) return `changed ${key}`;
  for (const [index, step] of prev.steps.entries()) {
    const later = next.steps[index];
    if (!later) return `dropped step "${step.title}"`;
    if (later.title !== step.title || later.seconds !== step.seconds || later.outcome !== step.outcome) return `changed step "${step.title}"`;
  }
  if (prev.failedStep && next.failedStep !== prev.failedStep) return 'changed the failed step';
  if (prev.boot && JSON.stringify(next.boot) !== JSON.stringify(prev.boot)) return 'changed the boot accounts';
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

/** One step as a run shows it: a check or a cross, its title and how many seconds it took. */
export function stepLine(step: RunStep): string {
  return `  ${step.outcome === 'ok' ? checkMark : crossMark} ${step.title.padEnd(36)} ${String(step.seconds).padStart(4)}s`;
}

/**
 * True when a job run started for `target` wrote the record: the same target, started while the run ran. The run's `created_at` and the
 * record's `startedAt` compare as ISO strings.
 */
export function wroteRecord(run: Pick<JobRun, 'created_at' | 'terminated_at'>, target: string | undefined, record: RunRecord): boolean {
  if (record.target !== target) return false;
  return record.startedAt >= (run.created_at ?? '') && (!run.terminated_at || record.startedAt <= run.terminated_at);
}

/** One line per run for a list: when, what, how it ended, and where it stopped. */
export function runSummaryLine(record: RunRecord): string {
  const seconds = record.endedAt ? Math.round((Date.parse(record.endedAt) - Date.parse(record.startedAt)) / 1000) : undefined;
  const took = seconds === undefined ? '' : ` in ${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, '0')}s`;
  const where = record.failedStep ? ` at "${record.failedStep}"` : '';
  return `${record.startedAt.slice(0, 16).replace('T', ' ')}  ${record.environment}  ${record.target.slice(0, 10)}  ${record.outcome}${where}${took}`;
}
