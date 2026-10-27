import { and, arrayOverlaps, asc, getColumns, inArray, sql } from 'drizzle-orm';
import type { AnyPgColumn, AnyPgTable } from 'drizzle-orm/pg-core';
import { type ActivityAction, appConfig, hierarchy, type ProductEntityType } from 'shared';
import { stripChangedFields } from '#/db/utils/strip-changed-fields';
import { getEntityTable } from '#/tables';
import { cdcDb } from '../lib/db';
import { log } from '../lib/pino';
import type { CdcRowData } from '../types';
import { isSoftDeleteTransition } from '../utils/is-soft-delete-transition';
import { isEmbeddingColumn } from './reference-columns';

type EmbeddingCleanupAction = Extract<ActivityAction, 'update' | 'delete'>;

/** Pre-resolved embedding with Drizzle column references. */
interface ResolvedEmbedding {
  embeddedProduct: ProductEntityType;
  hostTable: AnyPgTable;
  hostColumn: AnyPgColumn;
  hostColumnName: string;
  parentColumnName: string;
  parentColumn: AnyPgColumn;
  hostIdColumn: AnyPgColumn;
  hostStxColumn: AnyPgColumn;
}

/** What the cleanup writes through: the worker's pool, or the transaction a test keeps to itself. */
type CleanupExecutor = Pick<typeof cdcDb, 'transaction'>;

/** Resolves productEmbeddings to Drizzle column references at module init; throws on misconfiguration. */
function resolveEmbeddings(): ReadonlyMap<ProductEntityType, ResolvedEmbedding[]> {
  const resolved: ResolvedEmbedding[] = [];

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
    const parentType = hierarchy.getOrderedAncestors(embeddedProduct).find((ancestor) => !nullableAncestors.has(ancestor));
    if (!parentType) throw new Error(`productEmbeddings: "${embeddedProduct}" has no parent context: cleanup requires a scoping column`);

    const parentColumnName = appConfig.entityIdColumnKeys[parentType];
    const parentColumn = columns[parentColumnName];
    if (!parentColumn) throw new Error(`productEmbeddings: column "${parentColumnName}" not found on "${hostProduct}" table`);

    resolved.push({
      embeddedProduct,
      hostTable,
      hostColumn,
      hostColumnName,
      parentColumnName,
      parentColumn,
      hostIdColumn: columns.id,
      hostStxColumn: columns.stx,
    });
  }

  return Map.groupBy(resolved, (embedding) => embedding.embeddedProduct);
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
  db: CleanupExecutor = cdcDb,
): Promise<void> {
  const embeddings = embeddingsByProduct.get(embeddedProductType);
  if (!embeddings) return;

  // Hard delete: every event is a removal. Soft delete: only events that flip deletedAt.
  const relevantEvents = action === 'delete' ? events : events.filter(({ result }) => isSoftDeleteTransition(result.rowData, result.oldRowData));

  if (relevantEvents.length === 0) return;

  for (const { hostTable, hostColumn, hostColumnName, parentColumnName, parentColumn, hostIdColumn, hostStxColumn } of embeddings) {
    const references = relevantEvents.flatMap(({ result: { rowData } }) => {
      const parentId = rowData[parentColumnName];
      if (typeof parentId === 'string') return [{ parentId, id: rowData.id }];
      log.warn(`cleanupEmbeddingReferences: missing "${parentColumnName}" for embedded entity`, { id: rowData.id });
      return [];
    });
    // Grouped by parent scope, e.g. projectId.
    const byParent = Map.groupBy(references, (reference) => reference.parentId);

    // One parent after another, in a fixed order: two strips never wait for each other's rows the other way round.
    for (const parentId of [...byParent.keys()].sort()) {
      const embeddedIds = byParent.get(parentId)?.map((reference) => reference.id) ?? [];
      await db.transaction(async (tx) => {
        // Locked in id order before the strip: two strips over the same hosts take their locks the same way round.
        const hosts = await tx
          .select({ id: hostIdColumn })
          .from(hostTable)
          .where(and(arrayOverlaps(hostColumn, embeddedIds), sql`${parentColumn} = ${parentId}`))
          .orderBy(asc(hostIdColumn))
          .for('no key update');
        if (hosts.length === 0) return;

        await tx
          .update(hostTable)
          .set({
            [hostColumnName]: sql`(
            SELECT coalesce(array_agg(elem), '{}')
            FROM unnest(${hostColumn}) AS elem
            WHERE elem NOT IN ${embeddedIds}
          )`,
            stx: stripChangedFields(hostStxColumn),
          })
          .where(
            inArray(
              hostIdColumn,
              hosts.map((host) => host.id),
            ),
          );
      });
    }
  }
}

/**
 * Whether an update of a `hostProduct` row is the one `cleanupEmbeddingReferences` writes: its embedding columns only,
 * and no `updatedAt`, which an edit through the API always lists. The same column name on another table is no such
 * column.
 */
export function isReferenceCleanupWrite(hostProduct: string, changedFields: string[] | null): boolean {
  if (!changedFields || changedFields.length === 0 || changedFields.includes('updatedAt')) return false;
  return changedFields.every((field) => isEmbeddingColumn(hostProduct, field));
}
