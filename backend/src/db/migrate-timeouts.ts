import { sql } from 'drizzle-orm';
import type { PgDB, SessionTimeouts } from './create-connection';

/**
 * Session timeouts of the migrate companion's admin pool. An app transaction holds a table lock for milliseconds, so a statement
 * waiting 30s for one waits on a session that is not coming back, such as one of a destroyed VM, which keeps its locks until TCP
 * gives up hours later. Meanwhile the queued ACCESS EXCLUSIVE request stalls every query of the serving generation on that table.
 * No statement on an empty-ish database comes near 120s. Both sit below the boot runner's 180s ceiling on the release companion
 * (infra/resources/cloud-init.ts), so a stuck migration fails with the database's own error, not a killed container.
 */
export const migrateSessionTimeouts: SessionTimeouts = { lockMs: 30_000, statementMs: 120_000 };

/** SQLSTATE `lock_not_available`, raised when `lock_timeout` runs out. */
const lockTimeoutState = '55P03';

/** SQLSTATE `query_canceled`, raised when `statement_timeout` runs out (and on a manual cancel). */
const statementTimeoutState = '57014';

/** The SQLSTATE on an error or down its `cause` chain, where drizzle keeps the driver error. */
function sqlState(err: unknown): string | undefined {
  let current = err;
  for (let depth = 0; depth < 5 && typeof current === 'object' && current !== null; depth++) {
    if ('code' in current && typeof current.code === 'string') return current.code;
    current = 'cause' in current ? current.cause : undefined;
  }
  return undefined;
}

/**
 * Name the database wait behind a migrate failure.
 * @param err - The error the migrate companion caught.
 * @param timeouts - The session timeouts the failed run used.
 * @returns A sentence for the companion's output, or undefined when the error is not a session timeout.
 */
export function describeMigrateTimeout(err: unknown, timeouts: SessionTimeouts = migrateSessionTimeouts): string | undefined {
  const state = sqlState(err);
  if (state === lockTimeoutState) {
    return `a statement waited over ${timeouts.lockMs / 1000}s (lock_timeout) for a lock another session holds, and its transaction rolled back; the open transactions below are the suspects`;
  }
  if (state === statementTimeoutState) {
    return `a statement ran or waited over ${timeouts.statementMs / 1000}s (statement_timeout), and its transaction rolled back`;
  }
  return undefined;
}

/**
 * Best-effort list of the other sessions with an open transaction, oldest first, for a lock-wait failure. Query text stays out:
 * it can carry literals, and this output lands in the boot diagnostics. A role without `pg_read_all_stats` sees other roles'
 * sessions with blank state and client address.
 * @param db - A connection of the migrating role.
 * @returns One line per session, at most ten.
 */
export async function describeOpenTransactions(db: PgDB): Promise<string[]> {
  const result = await db.execute<{
    pid: number;
    usename: string | null;
    application_name: string | null;
    client_addr: string | null;
    state: string | null;
    wait_event_type: string | null;
    xact_seconds: number | null;
  }>(sql`
    SELECT pid, usename, application_name, client_addr::text AS client_addr, state, wait_event_type,
      floor(extract(epoch FROM now() - xact_start))::int AS xact_seconds
    FROM pg_stat_activity
    WHERE datname = current_database() AND pid <> pg_backend_pid() AND xact_start IS NOT NULL
    ORDER BY xact_start
    LIMIT 10
  `);
  return result.rows.map(
    (row) =>
      `pid=${row.pid} role=${row.usename ?? '?'} app=${row.application_name || '-'} client=${row.client_addr ?? 'local'} ` +
      `state=${row.state ?? '?'}${row.wait_event_type ? ` waiting=${row.wait_event_type}` : ''} transaction age=${row.xact_seconds ?? '?'}s`,
  );
}
