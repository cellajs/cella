import type { StackState } from '../stack/bootstrap-stack-state'

/**
 * Public JSON contract for `infra status`. Forks, agents, and CI may depend on
 * this shape; a breaking change bumps `STATUS_SCHEMA_VERSION`. See the schema
 * section in infra/README.md.
 */
export const STATUS_SCHEMA_VERSION = 1

/**
 * A check's verdict. `unknown` specifically means "could not be evaluated"
 * (usually a missing credential), never "evaluated and inconclusive": a check
 * that ran always resolves to one of the other four.
 */
export type CheckStatus = 'ok' | 'warn' | 'missing' | 'unknown' | 'error'

/**
 * Credential tier a check needs to run. `none` reads local files, env-var
 * presence, or public HTTP. `scaleway` needs an API key with state-bucket +
 * Secret Manager read (any operator OR CI deploy key satisfies it). A
 * `scaleway` check with no key available reports `unknown`, never `error`.
 */
export type CredentialTier = 'none' | 'scaleway'

/** A runnable remediation: a one-line description and the exact command. */
export interface NextAction {
  description: string
  command: string
}

/** One evaluated check. `id` is stable and part of the public contract. */
export interface Check {
  id: string
  title: string
  status: CheckStatus
  detail: string
  credential: CredentialTier
  nextAction?: NextAction
}

/** The full report emitted by `infra status` (the `--json` envelope). */
export interface StatusReport {
  schemaVersion: number
  mode: string
  /** ISO timestamp; stamped by the task, not the pure evaluator. */
  generatedAt: string
  stackState: StackState
  checks: Check[]
  /** Highest-priority pending action, or absent when nothing needs doing. */
  nextAction?: NextAction
  /** Count of checks per status value. */
  summary: Record<CheckStatus, number>
}

/** Whether the three external tools `infra` shells out to are on PATH. */
export interface ToolingInputs {
  pulumi: boolean
  dockerBuildx: boolean
  gh: boolean
}

/** GitHub Environment facts, gathered via `gh` when authenticated. */
export interface GithubInputs {
  authenticated: boolean
  /** `owner/repo`, or undefined when origin is not a GitHub remote. */
  repo?: string
  /** undefined when not checked (gh absent). */
  environmentExists?: boolean
  /** Names of required Environment secrets that are absent. */
  missingSecrets?: string[]
}

/** The held stack lock, if any. */
export interface LockInputs {
  held: boolean
  owner?: string
  operation?: string
  acquiredAt?: string
  /** ISO expiry. */
  expiresAt?: string
  /** True when `expiresAt` is in the past (breakable). The task computes this
   *  against the wall clock so the evaluator stays pure. */
  stale?: boolean
}

/** Per-service rollout pointers read from the S3 control object. */
export interface RolloutServiceInput {
  slug: string
  activeSha?: string
  pendingSha?: string
}

/** A public service's live health/version probe, cross-referenced with control. */
export interface LiveServiceInput {
  slug: string
  healthUrl: string
  /** undefined when the probe was not run. `status: 0` means unreachable. */
  probe?: { status: number; version?: string }
  /** Expected SHA from the control object's active generation, when known. */
  expectedSha?: string
}

/** DNS resolution of the app's frontend host. */
export interface DnsInputs {
  host: string
  /** Resolved A records; empty array = NXDOMAIN; undefined = not checked. */
  resolvedIps?: string[]
}

/**
 * Everything the pure evaluator needs. The task gathers these with best-effort
 * I/O; any field left `undefined` means "not gathered" (no credential, or the
 * probe threw). The evaluator maps that to an `unknown` check and never throws,
 * so `evaluateStatus` stays a total, pure function.
 */
export interface StatusInputs {
  mode: string
  stackState: StackState
  computeDeferredSince?: string
  tooling: ToolingInputs
  hasDomain: boolean
  /** True when SCW_ or AWS_ credentials are present for `scaleway`-tier checks. */
  credentialsAvailable: boolean
  projectId?: string
  operatorAppId?: string
  github?: GithubInputs
  /** undefined = not checked (no creds or error). */
  stateBucketExists?: boolean
  lock?: LockInputs
  /** undefined = control object could not be read. */
  rollout?: RolloutServiceInput[]
  /** Required operator-managed secrets with zero versions; undefined = not checked. */
  requiredSecretsMissing?: string[]
  live?: LiveServiceInput[]
  dns?: DnsInputs
}
