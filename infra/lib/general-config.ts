import type { Environment } from './stack/bootstrap-stack-state';

/** A value fixed for all deploy modes, or varying per mode (e.g. a larger DB in prod only). */
export type PerMode<T> = T | Partial<Record<Environment, T>>;

export interface GeneralConfig {
  compute: {
    /** The machines' image, which nothing is baked into: a stable NAME resolves to the newest matching Scaleway image when a deploy makes a machine; a literal UUID pins a specific image. */
    image: string;
  };
  database: {
    /** Scaleway managed-PostgreSQL node type (e.g. `'DB-DEV-S'`, `'DB-GP-XS'`). */
    nodeType: PerMode<string>;
    volumeSizeGb: PerMode<number>;
  };
  assets: {
    /** Days before stale, content-hashed frontend chunks under `assets/` expire. */
    retentionDays: PerMode<number>;
  };
  schedule: {
    /** Minutes between the main job's scheduled runs: a whole number from 1 to 60. */
    everyMinutes: PerMode<number>;
  };
}

/**
 * `config/general.config.ts`, checked as it loads.
 * @throws for a schedule cadence that is no whole number of minutes from 1 to 60, which no cron step writes
 */
export function defineGeneral<const T extends GeneralConfig>(config: T): T {
  const every = config.schedule.everyMinutes;
  for (const minutes of typeof every === 'object' ? Object.values(every) : [every]) {
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 60) {
      throw new Error(`general.config.ts: schedule.everyMinutes takes a whole number of minutes from 1 to 60, got ${minutes}.`);
    }
  }
  return config;
}

/** Resolve a `PerMode` value for the active deploy mode (throws if a map omits it). */
export function resolvePerMode<T extends string | number>(value: PerMode<T>, mode: Environment): T {
  if (typeof value !== 'object') return value;
  const resolved = value[mode];
  if (resolved === undefined) throw new Error(`general.config.ts: no value for mode '${mode}' in per-mode map ${JSON.stringify(value)}.`);
  return resolved;
}
