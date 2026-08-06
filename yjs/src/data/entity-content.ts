import { sql } from 'drizzle-orm';
import { appConfig, toTableName } from 'shared';
import type { DocContext } from '../constants';
import { withRlsTx } from './db';
import { getTableColumnNames } from './permissions';

/**
 * Load the BlockNote content column for the entity backing a Yjs document, to
 * seed a fresh collaborative session server-side.
 *
 * Convention (mirrors {@link resolveEntityScope}'s configuration-independent approach): the
 * Yjs-edited column is `description`. Entity types whose table lacks it (or
 * that this app doesn't declare) simply don't seed. The entity table is app-owned, so it is
 * queried dynamically (never through imported schema), on an RLS-scoped
 * transaction, and only after entity access has been verified.
 */
export async function loadEntityDescription(ctx: DocContext): Promise<string | null> {
  if (!(appConfig.entityTypes as readonly string[]).includes(ctx.entityType)) return null;

  return withRlsTx(ctx.tenantId, ctx.userId, async (tx) => {
    const table = toTableName(ctx.entityType);
    const existing = await getTableColumnNames(tx, table);
    if (!existing.has('description') || !existing.has('id')) return null;

    const { rows } = await tx.execute<{ description: string | null }>(
      sql`SELECT "description" FROM ${sql.raw(`"${table}"`)} WHERE "id" = ${ctx.entityId} LIMIT 1`,
    );
    return rows[0]?.description ?? null;
  });
}
