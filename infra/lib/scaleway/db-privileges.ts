/** The two PostgreSQL roles the engine provisions; the names are also the SQL role names the migrations reference. */
export const POSTGRES_ROLE_NAMES = { admin: 'admin_role', runtime: 'runtime_role' } as const;

/** Scaleway's default database, the only one where pg_cron may be created; the migrate step schedules jobs from it as the admin role. */
export const CRON_HOME_DATABASE = 'rdb';

export interface ExpectedDbPrivilege {
  user: string;
  database: string;
  /**
   * Permissions Scaleway may read back for a healthy grant: `all` as granted, and `custom` once any object was added to the database after
   * the grant, as Scaleway documents it: migrations add objects to the app database, the provider's extensions to its own.
   */
  acceptable: readonly string[];
}

/** The database privileges the operator task ensure-database grants (tasks/ensure-database.ts), in a form a live check can compare against. */
export function expectedDbPrivileges(dbName: string): ExpectedDbPrivilege[] {
  return [
    { user: POSTGRES_ROLE_NAMES.admin, database: dbName, acceptable: ['all', 'custom'] },
    { user: POSTGRES_ROLE_NAMES.admin, database: CRON_HOME_DATABASE, acceptable: ['all', 'custom'] },
    { user: POSTGRES_ROLE_NAMES.runtime, database: dbName, acceptable: ['all', 'custom'] },
  ];
}
