import { eq, sql } from 'drizzle-orm';
import {
  type AccessMembership,
  appConfig,
  buildSubject,
  type ChannelEntityType,
  type ChannelIdColumns,
  checkAccess,
  draftVisibleTo,
  hierarchy,
  isChannel,
  isProduct,
  type ProductEntityType,
  toColumnName,
  toTableName,
} from 'shared';
import { asRecord } from 'shared/utils/as-record';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import type { DocContext } from '../constants';
import { type Tx, withRlsTx } from './db';

// Constraint: no app-owned entity schema imports. App-declared entity tables are resolved dynamically from the DB.

/** Column names per table, read once from Postgres and cached per process, so the relay selects only columns a table has. */
const tableColumnsCache = new Map<string, Promise<Set<string>>>();

export function getTableColumnNames(tx: Tx, table: string): Promise<Set<string>> {
  let cached = tableColumnsCache.get(table);
  if (!cached) {
    cached = tx
      .execute<{ column_name: string }>(
        sql`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ${table}`,
      )
      .then((r) => new Set(r.rows.map((row) => row.column_name)))
      .catch((err) => {
        tableColumnsCache.delete(table); // don't cache failures
        throw err;
      });
    tableColumnsCache.set(table, cached);
  }
  return cached;
}

/** Runs on an RLS-scoped transaction, so the result is limited to the active tenant. */
export async function loadMemberships(tx: Tx, userId: string): Promise<AccessMembership[]> {
  return tx
    .select({
      channelType: membershipsTable.channelType,
      channelId: membershipsTable.channelId,
      role: membershipsTable.role,
    })
    .from(membershipsTable)
    .where(eq(membershipsTable.userId, userId));
}

/** Entity row carrying just the ancestor scope and ownership columns the permission engine needs. */
export interface EntityScopeRow extends Partial<ChannelIdColumns> {
  id: string;
  createdBy?: string | null;
  tenantId?: string | null;
}

/** Table and column names come from the app's schema conventions, filtered to columns the table has. Returns `null` if the entity type is not declared or the row does not exist. */
export async function resolveEntityScope(
  tx: Tx,
  entityType: ChannelEntityType | ProductEntityType,
  entityId: string,
): Promise<EntityScopeRow | null> {
  if (!(appConfig.entityTypes as readonly string[]).includes(entityType)) return null;

  const table = toTableName(entityType);
  const existing = await getTableColumnNames(tx, table);
  if (!existing.has('id')) return null; // unknown / non-conforming table

  // Logical keys the permission engine may read; an absent `publishedAt` column counts as published.
  const candidateKeys = ['id', 'createdBy', 'tenantId', 'publishedAt'];
  for (const ancestor of hierarchy.getOrderedAncestors(entityType)) {
    candidateKeys.push(appConfig.entityIdColumnKeys[ancestor]);
  }
  const selectKeys = candidateKeys.filter((key) => existing.has(toColumnName(key)));

  const projection = selectKeys.map((key) => `"${toColumnName(key)}" AS "${key}"`).join(', ');
  const { rows } = await tx.execute(
    sql`SELECT ${sql.raw(projection)} FROM ${sql.raw(`"${table}"`)} WHERE "id" = ${entityId} LIMIT 1`,
  );
  return (rows[0] as unknown as EntityScopeRow | undefined) ?? null;
}

/**
 * Mirrors the backend `verifyEntityOp`: one RLS-scoped transaction, then the shared permission engine for the `update` action.
 *
 * @throws MissingScopeError if the resolved entity is missing a required ancestor scope.
 */
export async function canEditEntity(ctx: DocContext): Promise<boolean> {
  const { entityType } = ctx;
  if (!isChannel(entityType) && !isProduct(entityType)) return false;

  return withRlsTx(ctx.tenantId, ctx.userId, async (tx) => {
    const [entity, memberships] = await Promise.all([
      resolveEntityScope(tx, entityType, ctx.entityId),
      loadMemberships(tx, ctx.userId),
    ]);

    if (!entity) return false;

    // Defense in depth: verify the tenant match even when RLS is not enforced, as on a superuser connection.
    if (typeof entity.tenantId === 'string' && entity.tenantId !== ctx.tenantId) return false;

    // Unpublished drafts are editable by their author alone: a lifecycle veto ahead of the engine, which has no draft vocabulary.
    if (!draftVisibleTo(asRecord(entity), ctx.userId)) return false;

    const createdBy = typeof entity.createdBy === 'string' || entity.createdBy === null ? entity.createdBy : undefined;
    const subject = buildSubject(entityType, entity, {
      id: entity.id,
      createdBy,
      // The row itself: without it, every row-derived grant ('own', public read) fails closed.
      row: asRecord(entity),
    });

    // Collaborative editing confers no system-admin bypass, matching the backend materialize endpoint.
    const { allowed } = checkAccess({ userId: ctx.userId, isSystemAdmin: false, memberships }, 'update', subject);
    return allowed;
  });
}
