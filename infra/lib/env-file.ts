/**
 * The single source of truth for whether a runtime secret VALUE can be
 * delivered to a VM through `/opt/app/.env.runtime`.
 *
 * Runtime secrets reach a VM as lines in a docker-compose `env_file`, which is
 * line-based: a value containing a newline (e.g. a raw multi-line PEM) cannot be
 * expressed and breaks `runtime-secret-sync`, which by design then blocks the
 * service from booting. A multi-line secret therefore took the backend down
 * once (`DATABASE_SSL_CA`); the fix is to base64-encode such values so they
 * stay single-line.
 *
 * This predicate encodes that contract so both the CI preflight
 * (`tasks/assert-secrets-deliverable.ts`) and tests assert the SAME rule the
 * on-VM Python sync enforces. Keep it in lockstep with the newline rejection in
 * `runtime-secret-sync` (resources/cloud-init.ts).
 */

export type EnvFileUndeliverableReason = 'empty' | 'multiline'

export interface EnvFileDeliverability {
  ok: boolean
  reason?: EnvFileUndeliverableReason
}

/** Whether `value` can be written as a single `KEY=value` line in an env file. */
export function isEnvFileDeliverable(value: string): EnvFileDeliverability {
  if (value === '') return { ok: false, reason: 'empty' }
  if (value.includes('\n') || value.includes('\r')) return { ok: false, reason: 'multiline' }
  return { ok: true }
}
