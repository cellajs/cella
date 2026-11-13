/** The two PostgreSQL roles the engine provisions; the names are also the SQL role names the migrations reference. */
export const POSTGRES_ROLE_NAMES = { admin: 'admin_role', runtime: 'runtime_role' } as const;

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
    { user: POSTGRES_ROLE_NAMES.runtime, database: dbName, acceptable: ['all', 'custom'] },
  ];
}
