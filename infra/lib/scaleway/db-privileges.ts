/** The two PostgreSQL roles the engine provisions; the names are also the SQL role names the migrations reference. */
export const POSTGRES_ROLE_NAMES = { admin: 'admin_role', runtime: 'runtime_role' } as const;

/** Scaleway's default database, the only one where pg_cron may be created; the migrate step schedules jobs from it as the admin role. */
export const CRON_HOME_DATABASE = 'rdb';

export interface ExpectedDbPrivilege {
  user: string;
  database: string;
  /** Permissions Scaleway may read back for a healthy grant. The app database starts at `all` and reads back `custom` once migrations revoke pieces. */
  acceptable: readonly string[];
}

/** The database privileges the Pulumi program declares (resources/stores/postgres-managed.ts), in a form a live check can compare against. */
export function expectedDbPrivileges(dbName: string): ExpectedDbPrivilege[] {
  return [
    { user: POSTGRES_ROLE_NAMES.admin, database: dbName, acceptable: ['all', 'custom'] },
    { user: POSTGRES_ROLE_NAMES.admin, database: CRON_HOME_DATABASE, acceptable: ['all'] },
    { user: POSTGRES_ROLE_NAMES.runtime, database: dbName, acceptable: ['all', 'custom'] },
  ];
}
