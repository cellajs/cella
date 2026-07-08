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

/** Derive the immutable VM generation id from the release SHA and plan-time config fingerprint. */
export function deriveGenId(sha: string, fingerprint: unknown): string {
  return createHash('sha256').update(`${sha}\n${stableStringify(fingerprint)}`).digest('hex').slice(0, GEN_ID_LENGTH)
}
