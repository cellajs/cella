import { and, arrayOverlaps, asc, getColumns, inArray, sql } from 'drizzle-orm';
import type { AnyPgColumn, AnyPgTable } from 'drizzle-orm/pg-core';
import { type ActivityAction, appConfig, hierarchy, type ProductEntityType } from 'shared';
import { getEntityTable } from '#/tables';
import { cdcDb } from '../lib/db';
import { log } from '../lib/pino';
import type { CdcRowData } from '../types';
import { applyCounterDeltas } from '../utils/apply-unified-deltas';
import { isCountableRow } from '../utils/countability';
import { isSoftDeleteTransition } from '../utils/is-soft-delete-transition';
import { isEmbeddingColumn } from './reference-columns';
import { stripChangedFieldsStx } from './strip-changed-fields';

type EmbeddingCleanupAction = Extract<ActivityAction, 'update' | 'delete'>;

/** Pre-resolved embedding with Drizzle column references. */
interface ResolvedEmbedding {
  hostProduct: string;
  hostTable: AnyPgTable;
  hostColumn: AnyPgColumn;
  hostColumnName: string;
  parentColumnName: string;
  parentColumn: AnyPgColumn;
  /** The host row as the strip reads it: its id, the ids it holds, and the columns that say whether it counts. */
  heldSelection: { id: AnyPgColumn; held: AnyPgColumn } & Record<string, AnyPgColumn>;
}

/** What the cleanup writes through: the worker's pool, or the transaction a test keeps to itself. */
type CleanupExecutor = Pick<typeof cdcDb, 'transaction'>;

/** The columns `isCountableRow` reads, where the host table has them. */
const countabilityColumns = ['deletedAt', 'publishedAt'];

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
    const parentType = hierarchy.getOrderedAncestors(embeddedProduct).find((ancestor) => !nullableAncestors.has(ancestor));
    if (!parentType) throw new Error(`productEmbeddings: "${embeddedProduct}" has no parent context: cleanup requires a scoping column`);

    const parentColumnName = appConfig.entityIdColumnKeys[parentType];
    const parentColumn = columns[parentColumnName];
    if (!parentColumn) throw new Error(`productEmbeddings: column "${parentColumnName}" not found on "${hostProduct}" table`);

    const heldSelection: ResolvedEmbedding['heldSelection'] = { id: columns.id, held: hostColumn };
    for (const name of countabilityColumns) if (columns[name]) heldSelection[name] = columns[name];

    const resolved: ResolvedEmbedding = { hostProduct, hostTable, hostColumn, hostColumnName, parentColumnName, parentColumn, heldSelection };
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
 *
 * The strip is the worker's own write: it comes back through the stream and is no activity there. So the references
 * it takes away are booked here, in the transaction of the strip: each embedded id loses one use per countable host
 * that held it. A strip that finds nothing, as on a second delivery, books nothing.
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

  for (const { hostProduct, hostTable, hostColumn, hostColumnName, parentColumnName, parentColumn, heldSelection } of embeddings) {
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

    // One parent after another, in a fixed order: two strips never wait for each other's rows the other way round.
    for (const parentId of [...byParent.keys()].sort()) {
      const embeddedIds = byParent.get(parentId) ?? [];
      await db.transaction(async (tx) => {
        // Locked in id order before the strip: what a host held is read from the row the strip then writes.
        const hosts = await tx
          .select(heldSelection)
          .from(hostTable)
          .where(and(arrayOverlaps(hostColumn, embeddedIds), sql`${parentColumn} = ${parentId}`))
          .orderBy(asc(heldSelection.id))
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
            stx: stripChangedFieldsStx(),
          })
          .where(
            inArray(
              heldSelection.id,
              hosts.map((host) => host.id),
            ),
          );

        const lostUses = new Map<string, number>();
        for (const host of hosts) {
          if (!isCountableRow(host)) continue;
          for (const id of Array.isArray(host.held) ? host.held : []) {
            if (embeddedIds.includes(id)) lostUses.set(id, (lostUses.get(id) ?? 0) + 1);
          }
        }
        for (const id of [...lostUses.keys()].sort()) {
          await applyCounterDeltas(tx, id, { [`e:c:${hostProduct}`]: -(lostUses.get(id) ?? 0) });
        }
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
