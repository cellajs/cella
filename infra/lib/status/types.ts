import type { AppliedEngine } from '../deploy/applied-engine';
import type { LiveRecord } from '../deploy/live-record';
import type { KeyPair } from '../scaleway/operator-identity';
import type { StackState } from '../stack/bootstrap-stack-state';

/** A check's verdict. `unknown` means "could not be evaluated", usually a missing key; a check that ran resolves to one of the other four. */
export type CheckStatus = 'ok' | 'warn' | 'missing' | 'unknown' | 'error';

/** Key tier a check needs: `none` reads local files or public HTTP; `scaleway` needs an API key with Object Storage, Secret Manager and database read, and reports `unknown` (never `error`) when no key is available. */
export type KeyTier = 'none' | 'scaleway';

/** A runnable remediation: a one-line description and the exact command. */
export interface NextAction {
  description: string;
  command: string;
}

/** One evaluated check. `id` is stable across releases. */
export interface Check {
  id: string;
  title: string;
  status: CheckStatus;
  detail: string;
  key: KeyTier;
  nextAction?: NextAction;
}

/** The full report emitted by `infra status` (the `--json` envelope). */
export interface StatusReport {
  mode: string;
  /** ISO timestamp; stamped by the task, not the pure evaluator. */
  generatedAt: string;
  stackState: StackState;
  checks: Check[];
  /** Highest-priority pending action, or absent when nothing needs doing. */
  nextAction?: NextAction;
  /** Count of checks per status value. */
  summary: Record<CheckStatus, number>;
}

/** The held lease, if any. */
export interface LockFacts {
  held: boolean;
  owner?: string;
  operation?: string;
  acquiredAt?: string;
  /** ISO expiry. */
  expiresAt?: string;
  /** True when `expiresAt` is in the past, so the lock is breakable. Computed by the gatherer against the wall clock so evaluation stays pure. */
  stale?: boolean;
}

/** Facts shared by the state, live and inventory providers (one read): the state bucket's presence and the control records. */
export interface ScalewayFacts {
  /** undefined = not checked (no creds or error). */
  stateBucketExists?: boolean;
  lock?: LockFacts;
  /** undefined = the live record could not be read. */
  live?: LiveRecord;
  /** The engine the last apply published; null before the first, undefined when it could not be read. */
  applied?: AppliedEngine | null;
}

/** Everything a provider's `gather` may draw on: stack context, the probe key, and the memoized control-object read the providers share. */
export interface ProbeSession {
  mode: string;
  appConfig: import('../../config/engine-config').EngineConfig;
  stackState: StackState;
  stackYaml?: string;
  projectId?: string;
  /** True when a Scaleway key (the observer key, else the process's SCW_* or AWS_* pair) is present for `scaleway`-tier checks. */
  scalewayKeyAvailable: boolean;
  accessKey?: string;
  secretKey?: string;
  /** The operator key the run holds, which lists the machines: the observer key reads none. Absent outside a session unlocked with it. */
  operatorKey?: KeyPair;
  hasDomain: boolean;
  /** True when the exposure overlay or stack config turns the public DB endpoint on. */
  dbExposureConfigured?: boolean;
  /** Memoized best-effort control-store read; never rejects. */
  scalewayFacts(): Promise<ScalewayFacts>;
}

/** One status domain: `gather` does best-effort I/O (undefined = could not probe) and `evaluate` never throws, so a run without a key still yields a complete report. Registry order is report order. */
export interface StatusProvider<F> {
  domain: string;
  gather(session: ProbeSession): Promise<F | undefined>;
  evaluate(facts: F | undefined, session: ProbeSession): Check[];
}
