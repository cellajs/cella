import { and, arrayOverlaps, getColumns, sql } from 'drizzle-orm';
import type { AnyPgColumn, AnyPgTable } from 'drizzle-orm/pg-core';
import { appConfig, type ActivityAction, hierarchy, type ProductEntityType } from 'shared';
import { getEntityTable } from '#/tables';
import { cdcDb } from '../lib/db';
import { log } from '../lib/pino';
import type { CdcRowData } from '../types';
import { isSoftDeleteTransition } from './is-soft-delete-transition';

type EmbeddingCleanupAction = Extract<ActivityAction, 'update' | 'delete'>;

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
function resolveEmbeddings(): ReadonlyMap<ProductEntityType, ResolvedEmbedding[]> {
  const map = new Map<ProductEntityType, ResolvedEmbedding[]>();

  for (const { embeddedEntity, hostEntity, hostColumn: hostColumnName } of appConfig.entityEmbeddings) {
    const hostTable = getEntityTable(hostEntity as Parameters<typeof getEntityTable>[0]);
    // getColumns returns literal-keyed columns; widen for runtime string lookup
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
 * Handles both hard deletes (`action === 'delete'`) and soft deletes (an UPDATE that
 * sets `deletedAt`). Soft delete keeps the row, so without this the host arrays would
 * keep dangling references to tombstoned entities.
 *
 * Runs in CDC (not in the user request) to avoid row locks during delete handlers.
 * The GIN index on the host column ensures fast containment checks, and the
 * parent-scoping filter limits the UPDATE scope.
 */
export async function cleanupEmbeddingReferences(
  embeddedEntityType: ProductEntityType,
  action: EmbeddingCleanupAction,
  events: { result: { rowData: CdcRowData; oldRowData?: CdcRowData | null } }[],
): Promise<void> {
  const embeddings = embeddingsByEntity.get(embeddedEntityType);
  if (!embeddings) return;

  // Hard delete: every event is a removal. Soft delete: only events that flip deletedAt.
  const relevantEvents =
    action === 'delete'
      ? events
      : events.filter(({ result }) => isSoftDeleteTransition(result.rowData, result.oldRowData));

  if (relevantEvents.length === 0) return;

  for (const { hostTable, hostColumn, hostColumnName, parentColumnName, parentColumn } of embeddings) {
    // Group deleted IDs by parent scope (e.g. projectId)
    const byParent = new Map<string, string[]>();
    for (const { result } of relevantEvents) {
      const { id } = result.rowData;
      const parentId = result.rowData[parentColumnName];
      if (!id || typeof parentId !== 'string') {
        if (id) log.warn(`cleanupEmbeddingReferences: missing "${parentColumnName}" for embedded entity`, { id });
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
