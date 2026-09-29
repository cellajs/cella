import { sql } from 'drizzle-orm';
import { appConfig, toTableName } from 'shared';
import type { DocScope } from '../constants';
import { withRlsTx } from './db';
import { getTableColumnNames } from './permissions';

/** By convention the Yjs-edited column is `description`; entity types whose table lacks it do not seed. The app-owned table is queried dynamically on an RLS-scoped transaction under the document's tenant, after entity access is verified. */
export async function loadEntityDescription(scope: DocScope): Promise<string | null> {
  if (!(appConfig.entityTypes as readonly string[]).includes(scope.entityType)) return null;

  return withRlsTx(scope.tenantId, '', async (tx) => {
    const table = toTableName(scope.entityType);
    const existing = await getTableColumnNames(tx, table);
    if (!existing.has('description') || !existing.has('id')) return null;

    const { rows } = await tx.execute<{ description: string | null }>(
      sql`SELECT "description" FROM ${sql.raw(`"${table}"`)} WHERE "id" = ${scope.entityId} LIMIT 1`,
    );
    return rows[0]?.description ?? null;
  });
}
