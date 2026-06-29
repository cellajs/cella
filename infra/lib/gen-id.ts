/**
 * Content-addressed generation identity.
 *
 * Every release provisions an immutable VM generation named `vm-<svc>-<genId>`.
 * The `genId` is a short, deterministic hash of the inputs that DEFINE the
 * generation: the release image SHA plus a fingerprint of the generation's
 * static, plan-time-known configuration (image reference, the compose env var
 * NAMES it consumes, runtime-secret manifest metadata, inter-service bindings,
 * and the base compute image id).
 *
 * Why content-addressed (vs the old `github.run_number` counter):
 *   - Re-running the same release reuses the SAME genId, so the existing healthy
 *     VM is reused — a re-run is a true idempotent no-op rather than a colliding
 *     "gen N == gen N" cutover that silently strands the LB.
 *   - A manual `pulumi up` derives the same genId from the same inputs, so the
 *     CLI and CI can never fork identity.
 *   - Any input that changes the VM (new image SHA, changed binding, new secret
 *     in the manifest) changes the genId, so it rolls a genuinely new generation.
 *
 * Deliberate scope note: the fingerprint hashes only SYNCHRONOUSLY-known config.
 * The fully rendered cloud-init is a Pulumi `Output` (it embeds resolved secret
 * ids and per-generation private IPs) and is therefore NOT available when the
 * resource name must be fixed at plan time — so it cannot seed the genId. Secret
 * VALUES are not plan-time inputs either; a value-only rotation is rolled by the
 * orchestrator bumping the release SHA, not by this hash.
 *
 * Pure and dependency-free so it is unit-testable and identical across the
 * Pulumi program (the genId authority) and any tooling that needs to predict it.
 */
import { createHash } from 'node:crypto'

/** Length of the hex genId suffix. 10 hex chars (40 bits) is collision-safe for
 *  the handful of generations a single service ever holds, and keeps the
 *  Scaleway resource name short. */
export const GEN_ID_LENGTH = 10

/** Stable JSON for an arbitrary fingerprint value: object keys are sorted so the
 *  hash is independent of declaration order. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

/** Derive the genId from the release SHA and a static config fingerprint value. */
export function deriveGenId(sha: string, fingerprint: unknown): string {
  return createHash('sha256').update(`${sha}\n${stableStringify(fingerprint)}`).digest('hex').slice(0, GEN_ID_LENGTH)
}
