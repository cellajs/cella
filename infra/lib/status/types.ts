import type { StackState } from '../stack/bootstrap-stack-state';

/** Public JSON contract version for `infra status`. A breaking shape change bumps it. */
export const STATUS_SCHEMA_VERSION = 1;

/** A check's verdict. `unknown` means "could not be evaluated", usually a missing credential; a check that ran resolves to one of the other four. */
export type CheckStatus = 'ok' | 'warn' | 'missing' | 'unknown' | 'error';

/** Credential tier a check needs. `none` reads local files or public HTTP; `scaleway` needs an API key with state-bucket and Secret Manager read, and reports `unknown` (never `error`) when no key is available. */
export type CredentialTier = 'none' | 'scaleway';

/** A runnable remediation: a one-line description and the exact command. */
export interface NextAction {
  description: string;
  command: string;
}

/** One evaluated check. `id` is stable and part of the public contract. */
export interface Check {
  id: string;
  title: string;
  status: CheckStatus;
  detail: string;
  credential: CredentialTier;
  nextAction?: NextAction;
}

/** The full report emitted by `infra status` (the `--json` envelope). */
export interface StatusReport {
  schemaVersion: number;
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

/** The held stack lock, if any. */
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

/** Per-service rollout pointers read from the S3 control object. */
export interface RolloutRowFact {
  slug: string;
  activeSha?: string;
  pendingSha?: string;
}

/** Control-bucket facts shared by the state and live providers (one read). */
export interface ScalewayFacts {
  /** undefined = not checked (no creds or error). */
  stateBucketExists?: boolean;
  lock?: LockFacts;
  /** undefined = control object could not be read. */
  rollout?: RolloutRowFact[];
}

/** Everything a provider's `gather` may draw on: stack context, credentials, and the memoized control-store read that lets the state and live providers share one S3 round-trip. */
export interface ProbeSession {
  mode: string;
  appConfig: import('../../config/engine-config').EngineConfig;
  stackState: StackState;
  stackYaml?: string;
  projectId?: string;
  /** True when SCW_ or AWS_ credentials are present for `scaleway`-tier checks. */
  credentialsAvailable: boolean;
  accessKey?: string;
  secretKey?: string;
  hasDomain: boolean;
  computeDeferredSince?: string;
  /** Memoized best-effort control-store read; never rejects. */
  scalewayFacts(): Promise<ScalewayFacts>;
}

/** One status domain: `gather` does best-effort I/O (undefined = could not probe) and `evaluate` never throws, so a partially-credentialed run still yields a complete report. Registry order is report order. */
export interface StatusProvider<F> {
  domain: string;
  gather(session: ProbeSession): Promise<F | undefined>;
  evaluate(facts: F | undefined, session: ProbeSession): Check[];
}
