import { sql } from 'drizzle-orm';
import { CDC_PUBLICATION_NAME } from '../constants';
import { cdcDb } from '../lib/db';
import { log } from '../lib/pino';
import { tableRegistry } from '../table-registry';

/**
 * What the stream depends on: `wal_level`, a publication that holds exactly the tables of the worker's registry,
 * replica identity FULL on each (the worker diffs old and new rows, and a delete needs the old one), and a role that
 * may read the slot and write past row-level security. The CDC migration sets up the first three, and a failure in it
 * is only a warning in its log, so the worker checks before it reads.
 * @param db - What the catalog is read through: the worker's pool, or a transaction a test set a role in.
 * @returns What is wrong, in sentences for the log and health; empty when the setup holds.
 */
export async function checkReplicationSetup(db: Pick<typeof cdcDb, 'execute'> = cdcDb): Promise<string[]> {
  const problems: string[] = [];
  const tracked = [...tableRegistry.keys()].sort();

  const walLevel = (await db.execute<{ wal_level: string }>(sql`SHOW wal_level`)).rows[0]?.wal_level;
  if (walLevel !== 'logical') problems.push(`wal_level is '${walLevel}': logical replication needs 'logical'`);

  const published = (
    await db.execute<{ tablename: string }>(
      sql`SELECT tablename FROM pg_publication_tables WHERE pubname = ${CDC_PUBLICATION_NAME} AND schemaname = 'public'`,
    )
  ).rows.map((row) => row.tablename);
  const missing = tracked.filter((table) => !published.includes(table));
  const extra = published.filter((table) => !tracked.includes(table));
  if (missing.length) problems.push(`publication '${CDC_PUBLICATION_NAME}' lacks tracked tables: ${missing.join(', ')}. Run the CDC migration`);
  if (extra.length) problems.push(`publication '${CDC_PUBLICATION_NAME}' holds tables the worker does not track: ${extra.sort().join(', ')}`);

  const identities = await db.execute<{ relname: string }>(
    sql`SELECT c.relname FROM pg_class c
        WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p') AND c.relreplident <> 'f'
          AND c.relname IN (${sql.join(
            tracked.map((table) => sql`${table}`),
            sql`, `,
          )})
        ORDER BY c.relname`,
  );
  if (identities.rows.length) {
    problems.push(`tracked tables without REPLICA IDENTITY FULL: ${identities.rows.map((row) => row.relname).join(', ')}. Run the CDC migration`);
  }

  // Managed providers refuse BYPASSRLS, so the bypass is read the way Postgres grants it: per table, to the owner of
  // a table whose row-level security is not forced. Without it a seq stamp changes zero rows and reports no error.
  const role = (
    await db.execute<{ role: string; superuser: boolean; bypass_rls: boolean; replication: boolean; rls_blocked_tables: string[] }>(
      sql`SELECT r.rolname AS role, r.rolsuper AS superuser, r.rolbypassrls AS bypass_rls, r.rolreplication AS replication,
            COALESCE(
              (SELECT array_agg(c.relname::text ORDER BY c.relname) FROM pg_class c
               WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r' AND c.relrowsecurity
                 AND (c.relforcerowsecurity OR c.relowner <> r.oid)),
              '{}'::text[]
            ) AS rls_blocked_tables
          FROM pg_roles r WHERE r.rolname = current_user`,
    )
  ).rows[0];
  if (role && !role.superuser) {
    if (!role.replication) problems.push(`role ${role.role} lacks REPLICATION`);
    if (!role.bypass_rls && role.rls_blocked_tables.length) {
      problems.push(`role ${role.role} does not bypass row-level security on: ${role.rls_blocked_tables.join(', ')}`);
    }
  }

  // A slot without a cap keeps WAL for as long as nothing reads it: a stopped worker would fill the disk.
  const keepSize = (await db.execute<{ max_slot_wal_keep_size: string }>(sql`SHOW max_slot_wal_keep_size`)).rows[0]?.max_slot_wal_keep_size;
  if (keepSize === '-1') log.warn('max_slot_wal_keep_size is unlimited: a worker that is down keeps WAL until the disk is full. Set a limit');

  return problems;
}
