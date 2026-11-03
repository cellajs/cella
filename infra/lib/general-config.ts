export interface GeneralConfig {
  compute: {
    /** Baked compute image. A stable NAME resolves to the newest matching Scaleway image at deploy time; a literal UUID pins a specific image. */
    image: string;
  };
  database: {
    /** Scaleway managed-PostgreSQL node type (e.g. `'DB-DEV-S'`, `'DB-GP-XS'`). */
    nodeType: string;
    volumeSizeGb: number;
  };
  assets: {
    /** Days before stale, content-hashed frontend chunks under `assets/` expire. */
    retentionDays: number;
  };
}

/** Identity helper for `config/general.config.ts` compile-time checking. */
export function defineGeneral<const T extends GeneralConfig>(config: T): T {
  return config;
}
