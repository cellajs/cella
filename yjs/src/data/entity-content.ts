import { appConfig, toTableName } from 'shared';
import type { DocContext } from '../constants';
import { withClient } from './db';
import { getTableColumnNames } from './permissions';

/**
 * Load the BlockNote content column for the entity backing a Yjs document,
 * used to seed a fresh collaborative session server-side.
 *
 * Convention (mirrors {@link resolveEntityScope}'s fork-agnostic approach): the
 * Yjs-edited column is `description`. Entity types whose table lacks it — or
 * that this app doesn't declare — simply don't seed. Runs on an RLS-scoped
 * client, and only after entity access has been verified.
 */
export async function loadEntityDescription(ctx: DocContext): Promise<string | null> {
  if (!(appConfig.entityTypes as readonly string[]).includes(ctx.entityType)) return null;

  return withClient(ctx.tenantId, ctx.userId, async (client) => {
    const table = toTableName(ctx.entityType);
    const existing = await getTableColumnNames(client, table);
    if (!existing.has('description') || !existing.has('id')) return null;

    const { rows } = await client.query<{ description: string | null }>(
      `SELECT "description" FROM "${table}" WHERE "id" = $1 LIMIT 1`,
      [ctx.entityId],
    );
    return rows[0]?.description ?? null;
  });
}
