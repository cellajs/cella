import { defineConfig } from 'drizzle-kit';

const databaseUrl = process.env.DATABASE_URL || '';
// Use admin URL for Drizzle Studio/push so it bypasses RLS (admin_role has BYPASSRLS)
const databaseAdminUrl = process.env.DATABASE_ADMIN_URL || databaseUrl;

/**
 * Drizzle configuration.
 * @link https://orm.drizzle.team/docs/drizzle-config-file
 */
export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  entities: {
    // Roles are provisioned outside drizzle (see scripts/db/create-db-roles.ts).
    // Exclude our custom roles plus every PostgreSQL built-in `pg_*` predefined
    // role. drizzle-kit's default system-role list misses newer ones
    // (`pg_checkpoint` in PG15, `pg_use_reserved_connections` /
    // `pg_create_subscription` in PG16, `pg_maintain` in PG17), so we list
    // them all explicitly to stay version-proof.
    roles: {
      exclude: [
        'admin_role',
        'runtime_role',
        'cdc_role',
        'postgres',
        'pg_checkpoint',
        'pg_create_subscription',
        'pg_database_owner',
        'pg_execute_server_program',
        'pg_maintain',
        'pg_monitor',
        'pg_read_all_data',
        'pg_read_all_settings',
        'pg_read_all_stats',
        'pg_read_server_files',
        'pg_signal_backend',
        'pg_stat_scan_tables',
        'pg_use_reserved_connections',
        'pg_write_all_data',
        'pg_write_server_files',
      ],
    },
  },
  dbCredentials: {
    url: databaseAdminUrl,
  },
});
