import type { Environment } from './stack/bootstrap-stack-state'

/** A value fixed for all deploy modes, or varying per mode (e.g. a larger DB in prod only). */
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
  assets: {
    /** Days before stale, content-hashed frontend chunks under `assets/` expire. */
    retentionDays: PerMode<number>
  }
}

/** Identity helper for `config/general.config.ts` compile-time checking. */
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
