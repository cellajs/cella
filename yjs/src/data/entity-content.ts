import { sql } from 'drizzle-orm';
import { appConfig, toTableName } from 'shared';
import type { DocScope } from '../constants';
import type { Tx } from './db';
import { getTableColumnNames } from './permissions';

/**
 * The entity's stored description, read FOR SHARE in the caller's transaction: an outside write's UPDATE of the row
 * waits until the caller commits, and a write in flight commits first and is read. Null when no live row exists in the
 * document's tenant (deleted, or never there). By convention the Yjs-edited column is `description`: a table without
 * it locks its row and gives none, and an entity type the app does not declare has no row to lock. The app-owned table
 * is queried dynamically, after entity access was verified; the tenant and live-row predicates repeat what RLS applies,
 * so the read is the same on a connection that bypasses it.
 */
export async function lockEntityDescription(tx: Tx, scope: DocScope): Promise<{ description: string | null } | null> {
  if (!(appConfig.entityTypes as readonly string[]).includes(scope.entityType)) return { description: null };

  const table = toTableName(scope.entityType);
  const existing = await getTableColumnNames(tx, table);
  if (!existing.has('id')) return { description: null };

  const description = existing.has('description') ? sql.raw('"description"') : sql`NULL::text`;
  const inTenant = existing.has('tenant_id') ? sql` AND "tenant_id" = ${scope.tenantId}` : sql``;
  const live = existing.has('deleted_at') ? sql` AND "deleted_at" IS NULL` : sql``;
  const { rows } = await tx.execute<{ description: string | null }>(
    sql`SELECT ${description} AS "description" FROM ${sql.raw(`"${table}"`)} WHERE "id" = ${scope.entityId}${inTenant}${live} FOR SHARE`,
  );
  return rows[0] ?? null;
}
