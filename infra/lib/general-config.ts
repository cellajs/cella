/**
 * General infra config — machinery for the fork-owned `config/general.config.ts`.
 *
 * Mirrors the `services.config.ts` / `runtime-secrets.config.ts` split: this
 * module owns the types + the `defineGeneral` identity helper + the per-mode
 * resolver, while the fork declares the *values* in `config/general.config.ts`.
 *
 * These are the non-service capacity/feature knobs that used to live as
 * hardcoded literals in `pulumi-context.ts` with a `pulumi config set` escape
 * hatch. Centralising them here makes a resize a one-line edit to a committed,
 * type-checked file (then a normal deploy) instead of an out-of-band stack-config
 * mutation. Secrets, transient break-glass toggles (DB public endpoint), and
 * bootstrap lifecycle markers deliberately stay in Pulumi config — they are not
 * fork data and must not be committed.
 *
 * Note: `database.*` changes are bootstrap-owned (the CI key is read-only on
 * RDB), so editing them here still requires a human `pulumi up` via the CLI's
 * "Apply infra change" — this file changes *where the value lives*, not *who
 * may apply it*.
 */
import type { Environment } from './bootstrap-stack-state'

/** A value fixed for all deploy modes, or varying per mode (e.g. WAF on in prod only). */
export type PerMode<T> = T | Partial<Record<Environment, T>>

export interface GeneralConfig {
  compute: {
    /** Baked compute image. A stable NAME resolves to the newest matching Scaleway image at deploy time; a literal UUID pins a specific image. */
    image: PerMode<string>
  }
  database: {
    /** Scaleway managed-PostgreSQL node type (e.g. `'DB-DEV-S'`, `'DB-GP-XS'`). */
    nodeType: PerMode<string>
    /** Provisioned DB volume size in GB. */
    volumeSizeGb: PerMode<number>
  }
  /** Web Application Firewall on the Edge Services pipeline. */
  waf: { enabled: PerMode<boolean> }
  /** Legacy Edge Services SPA pipeline (superseded by the `frontend` VM proxy). */
  edgeServices: { enabled: PerMode<boolean> }
  assets: {
    /** Days before stale, content-hashed frontend chunks under `assets/` expire. */
    retentionDays: PerMode<number>
  }
}

/** Identity helper — gives `config/general.config.ts` compile-time checking. */
export function defineGeneral<const T extends GeneralConfig>(config: T): T {
  return config
}

/** Resolve a `PerMode` value for the active deploy mode (throws if a map omits it). */
export function resolvePerMode<T>(value: PerMode<T>, mode: Environment): T {
  if (value !== null && typeof value === 'object') {
    const resolved = (value as Partial<Record<Environment, T>>)[mode]
    if (resolved === undefined) throw new Error(`general.config.ts: no value for mode '${mode}' in per-mode map ${JSON.stringify(value)}.`)
    return resolved
  }
  return value
}
