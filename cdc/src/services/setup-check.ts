import { sql } from 'drizzle-orm';
import { CDC_PUBLICATION_NAME } from '../constants';
import { cdcDb } from '../lib/db';
import { log } from '../lib/pino';
import { tableRegistry } from '../table-registry';

/**
 * What the stream depends on and the CDC migration sets up: `wal_level`, a publication that holds exactly the tables
 * of the worker's registry, and replica identity FULL on each (the worker diffs old and new rows, and a delete needs
 * the old one). A failure in that migration is only a warning in its log, so the worker checks before it reads.
 * @returns What is wrong, in sentences for the log and health; empty when the setup holds.
 */
export async function checkReplicationSetup(): Promise<string[]> {
  const problems: string[] = [];
  const tracked = [...tableRegistry.keys()].sort();

  const walLevel = (await cdcDb.execute<{ wal_level: string }>(sql`SHOW wal_level`)).rows[0]?.wal_level;
  if (walLevel !== 'logical') problems.push(`wal_level is '${walLevel}': logical replication needs 'logical'`);

  const published = (
    await cdcDb.execute<{ tablename: string }>(
      sql`SELECT tablename FROM pg_publication_tables WHERE pubname = ${CDC_PUBLICATION_NAME} AND schemaname = 'public'`,
    )
  ).rows.map((row) => row.tablename);
  const missing = tracked.filter((table) => !published.includes(table));
  const extra = published.filter((table) => !tracked.includes(table));
  if (missing.length) problems.push(`publication '${CDC_PUBLICATION_NAME}' lacks tracked tables: ${missing.join(', ')}. Run the CDC migration`);
  if (extra.length) problems.push(`publication '${CDC_PUBLICATION_NAME}' holds tables the worker does not track: ${extra.sort().join(', ')}`);

  const identities = await cdcDb.execute<{ relname: string }>(
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

  // A slot without a cap keeps WAL for as long as nothing reads it: a stopped worker would fill the disk.
  const keepSize = (await cdcDb.execute<{ max_slot_wal_keep_size: string }>(sql`SHOW max_slot_wal_keep_size`)).rows[0]?.max_slot_wal_keep_size;
  if (keepSize === '-1') log.warn('max_slot_wal_keep_size is unlimited: a worker that is down keeps WAL until the disk is full. Set a limit');

  return problems;
}
