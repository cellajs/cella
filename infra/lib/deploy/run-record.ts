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

/** One line per run for a list: when, what, how it ended, and where it stopped. */
export function runSummaryLine(record: RunRecord): string {
  const seconds = record.endedAt ? Math.round((Date.parse(record.endedAt) - Date.parse(record.startedAt)) / 1000) : undefined;
  const took = seconds === undefined ? '' : ` in ${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, '0')}s`;
  const where = record.failedStep ? ` at "${record.failedStep}"` : '';
  return `${record.startedAt.slice(0, 16).replace('T', ' ')}  ${record.environment}  ${record.target.slice(0, 10)}  ${record.outcome}${where}${took}`;
}
