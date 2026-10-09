import pg from 'pg';
import { appConfig } from 'shared';
import { createPgConnection } from '#/db/create-connection';
import { awaitBooksAnswer, requestBooks } from '#/modules/entities/sync-requests';
import { DB_URL } from './config';
import { ORG_ID } from './seeds/ids';

/** What the CDC worker has made of the bench organization's writes: its product activities and its counters. */
export interface PipelineSnapshot {
  activities: number;
  counts: Record<string, number>;
}

const cdcEnabled = appConfig.services.cdc.enabled !== false;

/** Consecutive readings without replication lag, 100 ms apart, before the CDC worker counts as caught up. */
const CAUGHT_UP_READINGS = 3;

async function readSnapshot(pool: pg.Pool): Promise<PipelineSnapshot> {
  const activities = await pool.query<{ total: number }>(
    'SELECT count(*)::int AS total FROM activities WHERE organization_id = $1 AND entity_type = ANY($2)',
    [ORG_ID, appConfig.productEntityTypes],
  );
  const counters = await pool.query<{ counts: Record<string, number> }>('SELECT counts FROM channel_counters WHERE channel_key = $1', [ORG_ID]);
  return { activities: activities.rows[0]?.total ?? 0, counts: counters.rows[0]?.counts ?? {} };
}

/** Bytes of WAL the worker has not confirmed yet: it confirms a position only after it processed everything up to it. */
async function readReplicationLag(pool: pg.Pool): Promise<number> {
  const { rows } = await pool.query<{ lag: string }>(
    `SELECT coalesce(max(pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn)), 0)::bigint AS lag
     FROM pg_replication_slots WHERE slot_type = 'logical' AND database = current_database()`,
  );
  return Number(rows[0]?.lag ?? 0);
}

/**
 * Waits until the CDC worker has processed what was written: its replication slot has no lag left and, where the
 * caller knows how many rows a run wrote, as many activities are recorded. `caughtUpMs` is how long the worker still
 * needed, null when it did not get there in time; without the CDC worker there is nothing to wait for.
 */
export async function settlePipeline(
  expectedActivities?: number,
  timeoutMs = 60_000,
): Promise<{ snapshot: PipelineSnapshot | null; caughtUpMs: number | null }> {
  if (!cdcEnabled) return { snapshot: null, caughtUpMs: 0 };

  const pool = new pg.Pool({ connectionString: DB_URL, max: 1 });
  try {
    const started = Date.now();
    let caughtUpAt = started;
    let readings = 0;
    while (Date.now() - started < timeoutMs) {
      const lag = await readReplicationLag(pool);
      const snapshot = await readSnapshot(pool);
      const reached = lag === 0 && (expectedActivities === undefined || snapshot.activities >= expectedActivities);
      if (!reached) readings = 0;
      else if (readings++ === 0) caughtUpAt = Date.now();
      if (readings >= CAUGHT_UP_READINGS) return { snapshot, caughtUpMs: caughtUpAt - started };
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return { snapshot: await readSnapshot(pool), caughtUpMs: null };
  } finally {
    await pool.end();
  }
}

/**
 * What a scenario's YAML header asks of its report, in comment lines: `# expect: a, b` names counters that must have
 * counted, `# forbid: c` counters that must not.
 */
export function readDirectives(source: string): { expect: string[]; forbid: string[] } {
  const directives = { expect: [] as string[], forbid: [] as string[] };
  for (const line of source.split('\n')) {
    const match = /^#\s*(expect|forbid):\s*(.+)$/.exec(line.trim());
    if (!match) continue;
    const names = match[2].split(',').map((name) => name.trim());
    directives[match[1] as 'expect' | 'forbid'].push(...names.filter(Boolean));
  }
  return directives;
}

/** The directives of a scenario that its report does not meet. A short run's single VU cannot be asked for `expect`: it plays one role of a scenario only. */
export function counterFindings(source: string, counters: Record<string, number>, short = false): string[] {
  const { expect, forbid } = readDirectives(source);
  return [
    ...(short ? [] : expect).filter((name) => !(counters[name] > 0)).map((name) => `${name} stayed at 0`),
    ...forbid.filter((name) => counters[name] > 0).map((name) => `${name} counted ${counters[name]}`),
  ];
}

/**
 * Where the CDC worker's record of a run differs from what its processors counted: `bench.rows_written` against the
 * activities recorded, and `bench.rows_created.<type>` minus `bench.rows_deleted.<type>` against the change of the
 * organization's `<type>` count. A processor that counts neither is not checked.
 */
export function pipelineFindings(before: PipelineSnapshot, after: PipelineSnapshot, counters: Record<string, number>): string[] {
  const findings: string[] = [];

  const written = counters['bench.rows_written'];
  const recorded = after.activities - before.activities;
  if (written !== undefined && recorded !== written) findings.push(`${written} rows were written, the CDC worker recorded ${recorded} activities`);

  const types = new Set(Object.keys(counters).flatMap((name) => /^bench\.rows_(?:created|deleted)\.(.+)$/.exec(name)?.[1] ?? []));
  for (const type of types) {
    const key = `e:c:${type}`;
    const expected = (before.counts[key] ?? 0) + (counters[`bench.rows_created.${type}`] ?? 0) - (counters[`bench.rows_deleted.${type}`] ?? 0);
    const counted = after.counts[key] ?? 0;
    if (counted !== expected) findings.push(`the ${type} count should be ${expected}, the counter says ${counted}`);
  }
  return findings;
}

/**
 * Asks the running CDC worker to verify its books against the tables, as `pnpm sync:verify` does, and waits for its
 * answer. The worker counts every counter from the tables at a snapshot and compares, while it reads on.
 * @returns What it found wrong, as findings for the run; empty when the books were right. The worker has rebuilt
 *   books it found wrong. A worker that does not answer is a finding too.
 */
export async function booksFindings(waitSeconds = 60): Promise<string[]> {
  if (!cdcEnabled) return [];

  const db = createPgConnection(DB_URL, { max: 1 });
  try {
    const since = await requestBooks(db, 'verify');
    const { answered, differences } = await awaitBooksAnswer(db, 'verify', since, waitSeconds);
    if (!answered) return [`the CDC worker did not verify its books within ${waitSeconds} s`];
    if (differences.length === 0) return [];
    return [
      `${differences.length} counter(s) differed from the tables, and the CDC worker rebuilt its books`,
      ...differences.slice(0, 5).map(({ channelKey, key, stored, counted }) => `${key} of ${channelKey} held ${stored}, the tables give ${counted}`),
    ];
  } finally {
    await db.$client.end();
  }
}
