import { sql } from 'drizzle-orm';
import { CDC_SLOT_NAME } from '../constants';
import { cdcDb } from '../db';
import { getErrorMessage } from './get-error-message';
import { logEvent } from '../pino';

const LOG_PREFIX = '[resource-monitor]';

/**
 * Get the current WAL bytes accumulated for the CDC slot.
 * Returns null if unable to determine.
 */
export async function getWalBytes(): Promise<number | null> {
  try {
    const result = await cdcDb.execute<{
      pg_wal_lsn_diff: bigint;
      confirmed_flush_lsn: string | null;
      restart_lsn: string | null;
    }>(
      sql`
        SELECT 
          pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn) as pg_wal_lsn_diff,
          confirmed_flush_lsn,
          restart_lsn
        FROM pg_replication_slots 
        WHERE slot_name = ${CDC_SLOT_NAME}
      `,
    );

    if (result.rows.length === 0) {
      return null;
    }

    // pg_wal_lsn_diff returns bytes as bigint
    return Number(result.rows[0].pg_wal_lsn_diff);
  } catch (error) {
    logEvent('error', `${LOG_PREFIX} Failed to query WAL bytes`, { error: getErrorMessage(error) });
    return null;
  }
}


