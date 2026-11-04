import { sql } from 'drizzle-orm';
import { publicationRowFilter } from '#/db/utils/publication-filter';
import { cdcPublicationName } from '../constants';
import { cdcDb, type Executor } from '../lib/db';
import { log } from '../lib/pino';
import { tableRegistry } from '../table-registry';

/** The row filter the CDC migration gives a tracked table, as `pg_publication_tables` shows it; null for none. */
function expectedRowFilter(table: string): string | null {
  const meta = tableRegistry.get(table);
  const filter = meta?.kind === 'entity' ? publicationRowFilter(meta.type, meta.table) : undefined;
  // Postgres shows a filter in parentheses.
  return filter ? `(${filter})` : null;
}

/**
 * What the stream depends on: `wal_level`, a publication that holds exactly the tables of the worker's registry, each
 * with its row filter (the draft boundary: no draft of a product reaches the worker), replica identity FULL on each
 * (the worker diffs old and new rows, and a delete needs the old one), and a role that may read the slot and write past
 * row-level security. The CDC migration sets up the publication and the replica identity, and a failure in it is only a
 * warning in its log, so the worker checks before it reads.
 * @param db - What the catalog is read through: the worker's pool, or a transaction a test set a role in.
 * @returns What is wrong, in sentences for the log and health; empty when the setup holds.
 */
export async function checkReplicationSetup(db: Executor = cdcDb): Promise<string[]> {
  const problems: string[] = [];
  const tracked = [...tableRegistry.keys()].sort();

  const walLevel = (await db.execute<{ wal_level: string }>(sql`SHOW wal_level`)).rows[0]?.wal_level;
  if (walLevel !== 'logical') problems.push(`wal_level is '${walLevel}': logical replication needs 'logical'`);

  const publishedFilters = new Map(
    (
      await db.execute<{ tablename: string; rowfilter: string | null }>(
        sql`SELECT tablename, rowfilter FROM pg_publication_tables WHERE pubname = ${cdcPublicationName} AND schemaname = 'public'`,
      )
    ).rows.map((row) => [row.tablename, row.rowfilter]),
  );
  const published = [...publishedFilters.keys()];
  const missing = tracked.filter((table) => !publishedFilters.has(table));
  const extra = published.filter((table) => !tracked.includes(table));
  const misfiltered = tracked.filter((table) => publishedFilters.has(table) && publishedFilters.get(table) !== expectedRowFilter(table));
  if (missing.length) problems.push(`publication '${cdcPublicationName}' lacks tracked tables: ${missing.join(', ')}. Run the CDC migration`);
  if (extra.length) problems.push(`publication '${cdcPublicationName}' holds tables the worker does not track: ${extra.sort().join(', ')}`);
  if (misfiltered.length) {
    const found = misfiltered.map((table) => `${table} (${publishedFilters.get(table) ?? 'none'}, expected ${expectedRowFilter(table) ?? 'none'})`);
    problems.push(`publication '${cdcPublicationName}' has another row filter on: ${found.join(', ')}. Run the CDC migration`);
  }

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
