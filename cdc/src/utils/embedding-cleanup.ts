import { and, arrayOverlaps, getColumns, sql } from 'drizzle-orm';
import type { AnyPgColumn, AnyPgTable } from 'drizzle-orm/pg-core';
import { type ActivityAction, appConfig, hierarchy, type ProductEntityType } from 'shared';
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

/** Resolves productEmbeddings to Drizzle column references at module init; throws on misconfiguration. */
function resolveEmbeddings(): ReadonlyMap<ProductEntityType, ResolvedEmbedding[]> {
  const map = new Map<ProductEntityType, ResolvedEmbedding[]>();

  for (const { embeddedProduct, hostProduct, hostColumn: hostColumnName } of appConfig.productEmbeddings) {
    const hostTable = getEntityTable(hostProduct as Parameters<typeof getEntityTable>[0]);
    // getColumns returns literal-keyed columns; widened for runtime string lookup.
    const columns = getColumns(hostTable) as Record<string, AnyPgColumn>;

    const hostColumn = columns[hostColumnName];
    if (!hostColumn) {
      // Hydrated single-reference embedding: only a `${hostColumnName}Id` column exists, and delete
      // flows reassign it synchronously, so there is no array to clean.
      if (columns[`${hostColumnName}Id`]) continue;
      throw new Error(`productEmbeddings: column "${hostColumnName}" not found on "${hostProduct}" table`);
    }

    // Scope by the deepest STRICT ancestor, not the parent: a nullable placement column may
    // be null on the deleted row (which would silently skip cleanup), while the strict ancestor
    // (ultimately the org root) is present on the row and on every host table.
    const nullableAncestors = new Set<string>(hierarchy.getNullableAncestors(embeddedProduct));
    const parentType = hierarchy
      .getOrderedAncestors(embeddedProduct)
      .find((ancestor) => !nullableAncestors.has(ancestor));
    if (!parentType)
      throw new Error(
        `productEmbeddings: "${embeddedProduct}" has no parent context: cleanup requires a scoping column`,
      );

    const parentColumnName = appConfig.entityIdColumnKeys[parentType];
    const parentColumn = columns[parentColumnName];
    if (!parentColumn)
      throw new Error(`productEmbeddings: column "${parentColumnName}" not found on "${hostProduct}" table`);

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
 * Removes deleted or unpublished embedded ids from configured host arrays. Runs outside request
 * handlers so the indexed, parent-scoped update does not take row locks on the request path.
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
    // Grouped by parent scope, e.g. projectId.
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

    await Promise.all(
      [...byParent].map(([parentId, embeddedIds]) => {
        const conditions = [arrayOverlaps(hostColumn, embeddedIds), sql`${parentColumn} = ${parentId}`];

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
      }),
    );
  }
}
