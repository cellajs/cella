import { and, eq, getColumns, inArray, isNull, sql } from 'drizzle-orm';
import type { AnyPgColumn, AnyPgTable } from 'drizzle-orm/pg-core';
import { appConfig, hierarchy, type ProductEntityType } from 'shared';
import { getEntityTable } from '#/tables';
import { cdcDb } from '../lib/db';
import { log } from '../lib/pino';
import type { CdcRowData } from '../types';
import { isSoftDeleteTransition } from './is-soft-delete-transition';
import { stripChangedFieldsStx } from './strip-changed-fields';

/** Columns the GC writes on an embedded row, beyond the scope and id columns. */
const requiredEmbeddedColumns = ['id', 'deletedAt', 'deletedBy', 'updatedAt', 'updatedBy'] as const;

/** Pre-resolved owned embedding with Drizzle column references, keyed by host product. */
interface ResolvedOwnedEmbedding {
  embeddedProduct: ProductEntityType;
  embeddedTable: AnyPgTable;
  embeddedColumns: Record<string, AnyPgColumn>;
  embeddedScopeColumn: AnyPgColumn;
  hostTable: AnyPgTable;
  hostColumn: AnyPgColumn;
  hostColumnName: string;
  hostScopeColumn: AnyPgColumn;
  /** Root channel id column both sides carry, e.g. `organizationId`. */
  scopeColumnName: string;
}

/**
 * Map lifecycle-'owned' productEmbeddings config to Drizzle references at module init.
 * Throws on misconfiguration so problems surface at startup, not at runtime.
 */
function resolveOwnedEmbeddings(): ReadonlyMap<ProductEntityType, ResolvedOwnedEmbedding[]> {
  const map = new Map<ProductEntityType, ResolvedOwnedEmbedding[]>();

  for (const embedding of appConfig.productEmbeddings) {
    if (embedding.lifecycle !== 'owned') continue;
    const { embeddedProduct, hostProduct, hostColumn: hostColumnName } = embedding;

    const hostTable = getEntityTable(hostProduct as Parameters<typeof getEntityTable>[0]);
    // getColumns returns literal-keyed columns; widen for runtime string lookup
    const hostColumns = getColumns(hostTable) as Record<string, AnyPgColumn>;
    const hostColumn = hostColumns[hostColumnName];
    if (!hostColumn) throw new Error(`owned embedding: column "${hostColumnName}" not found on "${hostProduct}" table`);

    const embeddedTable = getEntityTable(embeddedProduct as Parameters<typeof getEntityTable>[0]);
    const embeddedColumns = getColumns(embeddedTable) as Record<string, AnyPgColumn>;
    for (const required of requiredEmbeddedColumns) {
      if (!embeddedColumns[required]) throw new Error(`owned embedding: column "${required}" not found on "${embeddedProduct}" table`);
    }

    // Refcounting is scoped to the root channel: the broadest context both products share,
    // so a host in a sibling subtree still counts as a reference and spares the row.
    const rootChannel = hierarchy.getOrderedAncestors(embeddedProduct).at(-1);
    if (!rootChannel) throw new Error(`owned embedding: "${embeddedProduct}" has no channel ancestor to scope garbage collection by`);

    const scopeColumnName = appConfig.entityIdColumnKeys[rootChannel];
    const hostScopeColumn = hostColumns[scopeColumnName];
    const embeddedScopeColumn = embeddedColumns[scopeColumnName];
    if (!hostScopeColumn) throw new Error(`owned embedding: column "${scopeColumnName}" not found on "${hostProduct}" table`);
    if (!embeddedScopeColumn) throw new Error(`owned embedding: column "${scopeColumnName}" not found on "${embeddedProduct}" table`);

    const resolved: ResolvedOwnedEmbedding = {
      embeddedProduct,
      embeddedTable,
      embeddedColumns,
      embeddedScopeColumn,
      hostTable,
      hostColumn,
      hostColumnName,
      hostScopeColumn,
      scopeColumnName,
    };
    const list = map.get(hostProduct);
    if (list) list.push(resolved);
    else map.set(hostProduct, [resolved]);
  }

  return map;
}

/** Owned embeddings keyed by HOST product type (host-side dispatch, unlike embedding-cleanup). */
const ownedByHostProduct = resolveOwnedEmbeddings();

const toIdArray = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);

/** Per-scope removal candidates with the actor to attribute the soft-delete to. */
interface ScopeCandidates {
  ids: Set<string>;
  actorId: string | null;
}

/**
 * Garbage-collect owned embedded rows after their host arrays shrink.
 *
 * Dispatch is host-type-first: call this only for update batches of a product that is a
 * registered owned-embedding HOST. Removal candidates are ids observed leaving a host
 * array (soft-deleted hosts surrender their whole array); a candidate is soft-deleted
 * only when no live host row in the same root channel still references it. Rows never
 * referenced by any host are structurally exempt: only observed removals become candidates.
 *
 * The embedded row's soft-delete is a plain product UPDATE, so it flows through the
 * normal pipeline (seq stamp, activity, counter delta, propagation.remove hint).
 */
export async function gcOwnedEmbeddedRows(
  hostProductType: ProductEntityType,
  events: { result: { rowData: CdcRowData; oldRowData?: CdcRowData | null } }[],
): Promise<void> {
  const embeddings = ownedByHostProduct.get(hostProductType);
  if (!embeddings?.length) return;

  for (const embedding of embeddings) {
    const { embeddedProduct, embeddedTable, embeddedColumns, embeddedScopeColumn } = embedding;
    const { hostTable, hostColumn, hostColumnName, hostScopeColumn, scopeColumnName } = embedding;

    // Group removal candidates by root channel (the GC scope boundary)
    const byScope = new Map<string, ScopeCandidates>();

    for (const { result } of events) {
      const newRow = result.rowData;
      const oldRow = result.oldRowData;
      // No old image (REPLICA IDENTITY not FULL): nothing safe to diff
      if (!oldRow) continue;

      const oldIds = toIdArray(oldRow[hostColumnName]);
      if (oldIds.length === 0) continue;

      const kept = new Set(toIdArray(newRow[hostColumnName]));
      const removed = isSoftDeleteTransition(newRow, oldRow) ? oldIds : oldIds.filter((id) => !kept.has(id));
      if (removed.length === 0) continue;

      const scopeId = newRow[scopeColumnName];
      if (typeof scopeId !== 'string') {
        log.warn(`gcOwnedEmbeddedRows: missing "${scopeColumnName}" on host row`, { id: newRow.id });
        continue;
      }

      const actor = newRow.deletedBy ?? newRow.updatedBy;
      const group = byScope.get(scopeId) ?? { ids: new Set<string>(), actorId: null };
      for (const id of removed) group.ids.add(id);
      if (typeof actor === 'string') group.actorId = actor;
      byScope.set(scopeId, group);
    }

    if (byScope.size === 0) continue;

    await Promise.all(
      [...byScope].map(async ([scopeId, { ids, actorId }]) => {
        const candidates = [...ids];
        try {
          // WAL events arrive post-commit, so host arrays already reflect the removal:
          // any candidate still present in a live host row is referenced and survives.
          const referencedRows = await cdcDb
            .selectDistinct({ id: sql<string>`referenced.id` })
            .from(sql`${hostTable}, unnest(${hostColumn}) AS referenced(id)`)
            .where(
              and(
                sql`${hostScopeColumn} = ${scopeId}`,
                isNull((getColumns(hostTable) as Record<string, AnyPgColumn>).deletedAt),
                sql`referenced.id = ANY(${candidates})`,
              ),
            );
          const referenced = new Set(referencedRows.map((row) => row.id));
          const orphanIds = candidates.filter((id) => !referenced.has(id));
          if (orphanIds.length === 0) return;

          const now = new Date().toISOString();
          const deleted = await cdcDb
            .update(embeddedTable)
            .set({
              deletedAt: now,
              deletedBy: actorId,
              updatedAt: now,
              updatedBy: actorId,
              stx: stripChangedFieldsStx(),
            })
            .where(and(inArray(embeddedColumns.id, orphanIds), eq(embeddedScopeColumn, scopeId), isNull(embeddedColumns.deletedAt)))
            .returning({ id: embeddedColumns.id });

          if (deleted.length > 0) log.info('Owned embedded rows garbage-collected', { embeddedProduct, scopeId, count: deleted.length });
        } catch (err) {
          // The flush pipeline acks the WAL position regardless; a failed GC batch is a
          // leak, never a wrong delete. Log the ids so leaks stay diagnosable.
          log.error('gcOwnedEmbeddedRows failed; candidates leaked', { embeddedProduct, scopeId, candidates, err });
        }
      }),
    );
  }
}
