import { sql } from 'drizzle-orm';
import { cdcDb } from '../lib/db';
import { log } from '../lib/pino';

/** Attributes of the worker's own database role. Seq stamping under FORCE RLS needs BYPASSRLS; the replication slot needs REPLICATION. A superuser has both implicitly. */
export interface RoleCapabilities {
  role: string;
  bypassRls: boolean;
  replication: boolean;
}

let current: RoleCapabilities | null = null;

/** Null until probed, or when the probe failed. */
export function getRoleCapabilities(): RoleCapabilities | null {
  return current;
}

/**
 * Reads the role flags once at startup. A managed provider that refused BYPASSRLS or REPLICATION at role creation
 * leaves the worker unable to do its job, and the role script only emits a NOTICE, so the gap is logged here as an
 * error and reported through health before the first write fails.
 */
export async function probeRoleCapabilities(): Promise<RoleCapabilities | null> {
  try {
    const result = await cdcDb.execute<{ role: string; superuser: boolean; bypass_rls: boolean; replication: boolean }>(
      sql`SELECT rolname AS role, rolsuper AS superuser, rolbypassrls AS bypass_rls, rolreplication AS replication
          FROM pg_roles WHERE rolname = current_user`,
    );
    const row = result.rows[0];
    if (!row) return null;
    current = {
      role: row.role,
      bypassRls: row.superuser || row.bypass_rls,
      replication: row.superuser || row.replication,
    };
    if (!current.bypassRls || !current.replication) {
      log.error('CDC database role lacks required attributes; seq stamping or the replication slot will fail', {
        ...current,
      });
    }
    return current;
  } catch (err) {
    log.warn('Could not probe CDC database role attributes', { err });
    return null;
  }
}

/** Test seam. */
export function resetRoleCapabilities(): void {
  current = null;
}
