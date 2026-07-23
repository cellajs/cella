import { and, arrayOverlaps, getColumns, sql } from 'drizzle-orm';
import type { AnyPgColumn, AnyPgTable } from 'drizzle-orm/pg-core';
import { appConfig, type ActivityAction, hierarchy, type ProductEntityType } from 'shared';
import { getEntityTable } from '#/tables';
import { cdcDb } from '../lib/db';
import { log } from '../lib/pino';
import type { CdcRowData } from '../types';
import { isSoftDeleteTransition } from './is-soft-delete-transition';
import { stripChangedFieldsStx } from './strip-changed-fields';

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
 * Map productEmbeddings config → Drizzle column references at module init.
 * Throws on misconfiguration so problems surface at startup, not at runtime.
 */
function resolveEmbeddings(): ReadonlyMap<ProductEntityType, ResolvedEmbedding[]> {
  const map = new Map<ProductEntityType, ResolvedEmbedding[]>();

  for (const { embeddedProduct, hostProduct, hostColumn: hostColumnName } of appConfig.productEmbeddings) {
    const hostTable = getEntityTable(hostProduct as Parameters<typeof getEntityTable>[0]);
    // getColumns returns literal-keyed columns; widen for runtime string lookup
    const columns = getColumns(hostTable) as Record<string, AnyPgColumn>;

    const hostColumn = columns[hostColumnName];
    if (!hostColumn) throw new Error(`productEmbeddings: column "${hostColumnName}" not found on "${hostProduct}" table`);

    const parentType = hierarchy.getParent(embeddedProduct);
    if (!parentType) throw new Error(`productEmbeddings: "${embeddedProduct}" has no parent context — cleanup requires a scoping column`);

    const parentColumnName = appConfig.entityIdColumnKeys[parentType];
    const parentColumn = columns[parentColumnName];
    if (!parentColumn) throw new Error(`productEmbeddings: column "${parentColumnName}" not found on "${hostProduct}" table`);

    const resolved: ResolvedEmbedding = { hostTable, hostColumn, hostColumnName, parentColumnName, parentColumn };
    const list = map.get(embeddedProduct);
    if (list) list.push(resolved);
    else map.set(embeddedProduct, [resolved]);
  }

  return map;
}

/** Pre-resolved embedding lookups, keyed by embedded entity type. */
const embeddingsByProduct = resolveEmbeddings();

/**
 * Removes deleted or unpublished embedded IDs from configured host arrays.
 * CDC performs the indexed, parent-scoped cleanup outside request handlers to avoid row locks;
 * configuration supplies every embedding relationship.
 */
export async function cleanupEmbeddingReferences(
  embeddedProductType: ProductEntityType,
  action: EmbeddingCleanupAction,
  events: { result: { rowData: CdcRowData; oldRowData?: CdcRowData | null } }[],
): Promise<void> {
  const embeddings = embeddingsByProduct.get(embeddedProductType);
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
          stx: stripChangedFieldsStx(),
        })
        .where(and(...conditions));
    }));
  }
}
