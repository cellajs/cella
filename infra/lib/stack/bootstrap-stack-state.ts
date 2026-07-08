export type Environment = 'production' | 'staging'
export type StackState = 'fresh' | 'partial' | 'bootstrapped'

export interface StackProbe {
  /** Raw YAML text, or undefined if the file does not exist. */
  yamlText?: string
}

/**
 * - `fresh`: no stack file at all
 * - `partial`: file exists but no CI deploy key has been minted yet
 * - `bootstrapped`: file exists and records a minted CI deploy key
 *
 * `infra:bootstrapComplete` is a non-secret breadcrumb. Compat markers
 * (`infra:vmAccessKey`, `infra:applicationId`) also count as bootstrapped.
 */
const BOOTSTRAP_MARKERS = ['infra:bootstrapComplete', 'infra:vmAccessKey', 'infra:applicationId'] as const

export function detectStackState(probe: StackProbe): StackState {
  const yamlText = probe.yamlText
  if (yamlText == null) return 'fresh'
  return BOOTSTRAP_MARKERS.some((marker) => yamlText.includes(marker)) ? 'bootstrapped' : 'partial'
}

/**
 * Pick the first stack short-name (production, staging) whose Pulumi file
 * is present. Pure: caller supplies the existence check.
 */
export function pickStackShort(exists: (shortName: string) => boolean, candidates: readonly Environment[] = ['production', 'staging']): Environment {
  return candidates.find(exists) ?? 'production'
}

/**
 * Extract the plaintext `bootstrap:computeDeferred: <iso-timestamp>` marker.
 * The bootstrap CLI sets it before the first `pulumi up` of a FRESH provision
 * (no images exist yet, so compute is intentionally not declared) and clears it
 * once base infra is up. Returns undefined when not present. Pure.
 */
export function extractComputeDeferredMarker(yamlText: string): string | undefined {
  return yamlText.match(/^\s*bootstrap:computeDeferred:\s*(.+)$/m)?.[1]?.trim()
}

/**
 * Detect a leftover `bootstrap:computeDeferred` marker, the trace of a fresh
 * provision whose initial `pulumi up` did not complete. While present, compute
 * stays gated off (helpers.ts), which is correct until images are pushed; the
 * next successful provisioning `pulumi up` clears it. Returns the marker value
 * when present, or undefined when clean. Pure.
 */
export function detectComputeDeferred(yamlText?: string): string | undefined {
  return yamlText ? extractComputeDeferredMarker(yamlText) : undefined
}
