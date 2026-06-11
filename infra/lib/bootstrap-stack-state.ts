/**
 * Pure parser for Pulumi.<stack>.yaml bootstrap state. Used by the bootstrap
 * command handlers and by tests. No fs; the caller passes the YAML text (or
 * undefined if file is missing).
 */

export type Environment = 'production' | 'staging'
export type StackState = 'fresh' | 'partial' | 'bootstrapped'

export interface StackProbe {
  /** Raw YAML text, or undefined if the file does not exist. */
  yamlText?: string
}

/**
 * - `fresh`        — no stack file at all
 * - `partial`      — file exists but no CI deploy key has been minted yet
 * - `bootstrapped` — file exists and records a minted CI deploy key
 *
 * Nothing secret remains in stack config: the CI deploy key lives in the GitHub
 * Environment (provider auth from SCW_* env), the identity ids are derived from
 * the IAM API, and the VM reader key now lives in Secret Manager (SOVRUN §3.3).
 * The marker is therefore a dedicated non-secret breadcrumb, `infra:bootstrapComplete`,
 * stamped once the CI key is minted. Legacy markers (`infra:vmAccessKey`,
 * `infra:applicationId`) are still honoured so stacks bootstrapped before this
 * change keep reporting `bootstrapped` until the operator runs `pulumi config rm`.
 */
const BOOTSTRAP_MARKERS = ['infra:bootstrapComplete', 'infra:vmAccessKey', 'infra:applicationId'] as const

export function detectStackState(probe: StackProbe): StackState {
  if (probe.yamlText == null) return 'fresh'
  return BOOTSTRAP_MARKERS.some((marker) => probe.yamlText!.includes(marker)) ? 'bootstrapped' : 'partial'
}

/**
 * Pick the first stack short-name (production, staging) whose Pulumi file
 * is present. Pure: caller supplies the existence check.
 */
export function pickStackShort(exists: (shortName: string) => boolean, candidates: readonly Environment[] = ['production', 'staging']): Environment {
  return candidates.find(exists) ?? 'production'
}

/**
 * Extract the scaleway:projectId from a Pulumi stack YAML (plaintext config).
 * Returns undefined when not present.
 */
export function extractProjectId(yamlText: string): string | undefined {
  return yamlText.match(/^\s*scaleway:projectId:\s*(\S+)/m)?.[1]
}

/**
 * Extract the plaintext `bootstrap:applyInProgress: <iso-timestamp>` marker
 * written by apply-mode before swapping the CI key out. Returns undefined
 * when not present. Pure.
 */
export function extractApplyMarker(yamlText: string): string | undefined {
  return yamlText.match(/^\s*bootstrap:applyInProgress:\s*(.+)$/m)?.[1]?.trim()
}

export interface ApplyInterruptedTrace {
  /** Human-readable description of where we detected the trace. */
  trace: string
}

/**
 * Detect whether a prior "Apply infra change" run was interrupted between
 * swapping the CI key out and restoring it. Either signal is enough:
 *   - A verbatim stack-file backup (`Pulumi.<stack>.yaml.apply-backup`) is
 *     still on disk — apply-mode writes it before the swap and removes it
 *     after restore, so its presence means a run did not finish. This is the
 *     actionable trace: the backup restores the CI key byte-for-byte.
 *   - YAML marker `bootstrap:applyInProgress` is present in the stack file
 *     (secondary trace; normally cleared together with the backup).
 * Returns a trace descriptor when interrupted, or undefined when clean. Pure.
 */
export function detectInterruptedApply(probe: { yamlText?: string; backupExists: boolean; backupPath: string }): ApplyInterruptedTrace | undefined {
  if (probe.backupExists) return { trace: `Backup file: ${probe.backupPath}` }
  const marker = probe.yamlText ? extractApplyMarker(probe.yamlText) : undefined
  if (marker) return { trace: `YAML marker bootstrap:applyInProgress = ${marker}` }
  return undefined
}
