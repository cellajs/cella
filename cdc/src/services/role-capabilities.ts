import { sql } from 'drizzle-orm';
import { cdcDb } from '../lib/db';
import { log } from '../lib/pino';

/**
 * What the worker's own database role can do. Seq stamping needs an effective RLS bypass on every RLS-enabled table
 * (owner of a never-forced table, BYPASSRLS, or superuser); the replication slot needs REPLICATION (or superuser).
 */
export interface RoleCapabilities {
  role: string;
  /** True when no RLS-enabled public table would filter this role's reads and writes. */
  rlsBypass: boolean;
  /** RLS-enabled tables the role cannot bypass: forced, or owned by another role. Empty when `rlsBypass` is true. */
  rlsBlockedTables: string[];
  replication: boolean;
}

let current: RoleCapabilities | null = null;

/** Null until probed, or when the probe failed. */
export function getRoleCapabilities(): RoleCapabilities | null {
  return current;
}

/**
 * Reads the role's effective capabilities once at startup. Managed providers (Scaleway) refuse BYPASSRLS, so the
 * bypass is checked the way PostgreSQL grants it: per table, as owner of an RLS-enabled table that is not forced. A
 * gap is logged as an error and reported through health before the first stamp silently affects zero rows.
 */
export async function probeRoleCapabilities(): Promise<RoleCapabilities | null> {
  try {
    const result = await cdcDb.execute<{
      role: string;
      superuser: boolean;
      bypass_rls: boolean;
      replication: boolean;
      rls_blocked_tables: string[];
    }>(
      sql`SELECT r.rolname AS role, r.rolsuper AS superuser, r.rolbypassrls AS bypass_rls, r.rolreplication AS replication,
            COALESCE(
              (SELECT array_agg(c.relname::text ORDER BY c.relname) FROM pg_class c
               WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r' AND c.relrowsecurity
                 AND (c.relforcerowsecurity OR c.relowner <> r.oid)),
              '{}'::text[]
            ) AS rls_blocked_tables
          FROM pg_roles r WHERE r.rolname = current_user`,
    );
    const row = result.rows[0];
    if (!row) return null;
    const attributeBypass = row.superuser || row.bypass_rls;
    const rlsBlockedTables = attributeBypass ? [] : row.rls_blocked_tables;
    current = {
      role: row.role,
      rlsBypass: attributeBypass || rlsBlockedTables.length === 0,
      rlsBlockedTables,
      replication: row.superuser || row.replication,
    };
    if (!current.rlsBypass || !current.replication) {
      log.error(
        'CDC database role cannot bypass RLS on every table or open the slot; seq stamping or replication will fail',
        {
          ...current,
        },
      );
    }
    return current;
  } catch (err) {
    log.warn('Could not probe CDC database role capabilities', { err });
    return null;
  }
}

/** Test seam. */
export function resetRoleCapabilities(): void {
  current = null;
}
