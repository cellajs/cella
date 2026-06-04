import { and, arrayOverlaps, getColumns, sql } from 'drizzle-orm';
import type { AnyPgColumn, AnyPgTable } from 'drizzle-orm/pg-core';
import { appConfig, hierarchy } from 'shared';
import { getEntityTable } from '#/tables';
import { cdcDb } from '../lib/db';
import { logEvent } from '../lib/pino';
import type { CdcRowData } from '../types';

/** Pre-resolved embedding with Drizzle column references. */
interface ResolvedEmbedding {
  hostTable: AnyPgTable;
  hostColumn: AnyPgColumn;
  hostColumnName: string;
  parentColumnName: string;
  parentColumn: AnyPgColumn;
}

/**
 * Map entityEmbeddings config → Drizzle column references at module init.
 * Throws on misconfiguration so problems surface at startup, not at runtime.
 */
function resolveEmbeddings(): ReadonlyMap<string, ResolvedEmbedding[]> {
  const map = new Map<string, ResolvedEmbedding[]>();

  for (const { embeddedEntity, hostEntity, hostColumn: hostColumnName } of appConfig.entityEmbeddings) {
    const hostTable = getEntityTable(hostEntity as Parameters<typeof getEntityTable>[0]);
    // getTableColumns returns literal-keyed columns; widen for runtime string lookup
    const columns = getColumns(hostTable) as Record<string, AnyPgColumn>;

    const hostColumn = columns[hostColumnName];
    if (!hostColumn) throw new Error(`entityEmbeddings: column "${hostColumnName}" not found on "${hostEntity}" table`);

    const parentType = hierarchy.getParent(embeddedEntity);
    if (!parentType) throw new Error(`entityEmbeddings: "${embeddedEntity}" has no parent context — cleanup requires a scoping column`);

    const parentColumnName = appConfig.entityIdColumnKeys[parentType];
    const parentColumn = columns[parentColumnName];
    if (!parentColumn) throw new Error(`entityEmbeddings: column "${parentColumnName}" not found on "${hostEntity}" table`);

    const resolved: ResolvedEmbedding = { hostTable, hostColumn, hostColumnName, parentColumnName, parentColumn };
    const list = map.get(embeddedEntity);
    if (list) list.push(resolved);
    else map.set(embeddedEntity, [resolved]);
  }

  return map;
}

/** Pre-resolved embedding lookups, keyed by embedded entity type. */
const embeddingsByEntity = resolveEmbeddings();

/**
 * Strip deleted embedded-entity IDs from host-entity array columns.
 *
 * Driven by `appConfig.entityEmbeddings` — adding a new embedding relationship
 * (e.g. tags on attachments) requires zero changes here.
 *
 * Runs in CDC (not in the user request) to avoid row locks during delete handlers.
 * The GIN index on the host column ensures fast containment checks, and the
 * parent-scoping filter limits the UPDATE scope.
 */
export async function cleanupEmbeddingReferences(
  embeddedEntityType: string,
  action: string,
  events: { result: { rowData: CdcRowData } }[],
): Promise<void> {
  if (action !== 'delete') return;

  const embeddings = embeddingsByEntity.get(embeddedEntityType);
  if (!embeddings) return;

  for (const { hostTable, hostColumn, hostColumnName, parentColumnName, parentColumn } of embeddings) {
    // Group deleted IDs by parent scope (e.g. projectId)
    const byParent = new Map<string, string[]>();
    for (const { result } of events) {
      const { id } = result.rowData;
      const parentId = result.rowData[parentColumnName];
      if (!id || typeof parentId !== 'string') {
        if (id) logEvent('warn', `cleanupEmbeddingReferences: missing "${parentColumnName}" for embedded entity`, { id });
        continue;
      }

      const ids = byParent.get(parentId);
      if (ids) ids.push(id);
      else byParent.set(parentId, [id]);
    }

    await Promise.all([...byParent].map(([parentId, embeddedIds]) => {
      const conditions = [
        arrayOverlaps(hostColumn, embeddedIds),
        sql`${parentColumn} = ${parentId}`,
      ];

      return cdcDb
        .update(hostTable)
        .set({
          [hostColumnName]: sql`(
            SELECT coalesce(array_agg(elem), '{}')
            FROM unnest(${hostColumn}) AS elem
            WHERE elem != ALL(${embeddedIds})
          )`,
          // Strip changedFields from stx so CDC's handleUpdate recognizes this as
          // a cleanup write (WAL diff fallback) rather than a user-driven mutation.
          stx: sql`stx - 'changedFields'`,
        })
        .where(and(...conditions));
    }));
  }
}
