import { execSync } from 'node:child_process';
import { sql } from 'drizzle-orm';
import { CDC_SLOT_NAME, RESOURCE_LIMITS } from '../constants';
import { cdcDb } from '../db';
import { logEvent } from '../pino';

const { wal: WAL, startup } = RESOURCE_LIMITS;
const LOG_PREFIX = '[resource-monitor]';

/**
 * Format bytes to human-readable string (MB or GB).
 */
export function fmtBytes(b: number): string {
  return b >= 1e9 ? `${(b / 1e9).toFixed(2)} GB` : `${(b / 1e6).toFixed(2)} MB`;
}

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
    const errorMessage = error instanceof Error ? error.message : String(error);
    logEvent('error', `${LOG_PREFIX} Failed to query WAL bytes`, { error: errorMessage });
    return null;
  }
}

/** Directories to check for disk space, in order of preference */
const DISK_CHECK_DIRS = ['/var/lib/postgresql', '/data', '/var/lib/pgsql', '/opt/homebrew/var/postgresql', '.'];

/**
 * Get available disk space in bytes.
 * Tries multiple PostgreSQL data directories, returns null if can't determine.
 */
export function getFreeDiskSpace(): number | null {
  for (const dir of DISK_CHECK_DIRS) {
    try {
      const output = execSync(`df -B1 ${dir} 2>/dev/null | tail -1 | awk '{print $4}'`, { encoding: 'utf-8' });
      const bytes = Number.parseInt(output.trim(), 10);
      if (bytes > 0) return bytes;
    } catch {
      /* try next */
    }
  }
  return null;
}

/**
 * Configure PostgreSQL WAL limits based on available disk space.
 * Sets max_slot_wal_keep_size to prevent unbounded WAL growth.
 */
export async function configureWalLimits(): Promise<void> {
  const free = getFreeDiskSpace();
  if (free === null) {
    logEvent('warn', `${LOG_PREFIX} Could not determine disk space, using default WAL limits`);
    return;
  }

  if (free < startup.minFreeDisk) {
    const msg = `${LOG_PREFIX} Insufficient disk: ${fmtBytes(free)} < ${fmtBytes(startup.minFreeDisk)} required`;
    logEvent('fatal', msg);
    throw new Error(msg);
  }

  const limit = Math.min(WAL.maxSize, Math.max(WAL.minSize, Math.floor(free * WAL.percentageOfDisk)));
  const limitGB = Math.floor(limit / 1e9);

  logEvent('info', `${LOG_PREFIX} Configuring WAL limits`, { free: fmtBytes(free), limit: fmtBytes(limit) });

  try {
    // Note: ALTER SYSTEM requires superuser. cdc_role may not have this privilege.
    // In production, WAL limits should be pre-configured via infrastructure.
    await cdcDb.execute(sql`ALTER SYSTEM SET max_slot_wal_keep_size = ${limitGB}GB`);
    await cdcDb.execute(sql`SELECT pg_reload_conf()`);
    logEvent('info', `${LOG_PREFIX} WAL limits configured`, { max_slot_wal_keep_size: `${limitGB}GB` });
  } catch (err) {
    // Expected to fail if cdc_role lacks superuser privilege - log and continue
    logEvent('warn', `${LOG_PREFIX} Could not configure WAL limits (requires superuser)`, {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Resource thresholds for health checks.
 */
export interface ResourceStatus {
  walBytes: number | null;
  freeDiskBytes: number | null;
  isHealthy: boolean;
  warnings: string[];
}

/**
 * Get current resource status for health monitoring.
 */
export async function getResourceStatus(): Promise<ResourceStatus> {
  const walBytes = await getWalBytes();
  const freeDiskBytes = getFreeDiskSpace();
  const warnings: string[] = [];
  const { runtime } = RESOURCE_LIMITS;

  if (walBytes !== null && walBytes > runtime.walWarningBytes) {
    warnings.push(`WAL accumulation high: ${fmtBytes(walBytes)}`);
  }

  if (freeDiskBytes !== null && freeDiskBytes < runtime.diskWarningBytes) {
    warnings.push(`Disk space low: ${fmtBytes(freeDiskBytes)}`);
  }

  const isHealthy =
    (walBytes === null || walBytes <= runtime.walShutdownBytes) &&
    (freeDiskBytes === null || freeDiskBytes >= runtime.diskShutdownBytes);

  return { walBytes, freeDiskBytes, isHealthy, warnings };
}
