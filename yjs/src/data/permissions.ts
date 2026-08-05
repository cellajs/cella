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

// Constraint: no fork-owned entity schema imports. Cella-owned tables (memberships) are
// queried through their typed drizzle schema; app-declared entity tables are resolved
// dynamically from the DB so this file works for every fork unchanged.

/**
 * Column names that exist on a table, read once from Postgres and cached per process.
 *
 * Lets the relay select only the columns a table actually has (each app's entities differ)
 * without importing fork-owned entity schema. The DB is
 * the source of truth, so this stays correct across apps and migrations.
 */
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

/**
 * Load the user's memberships in the shape the permission engine expects.
 *
 * Runs on an RLS-scoped transaction (tenant + user already set by {@link withRlsTx}), so the
 * result is naturally limited to the active tenant. Memberships are cella-owned, so the typed
 * drizzle schema applies; only the three columns the engine reads are selected.
 */
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

/**
 * Resolve an entity's ancestor scope (e.g. `organizationId`), `createdBy`, and `tenantId`.
 *
 * Reads only the columns the permission engine needs. Table and column names are derived from the
 * app's schema conventions (`toTableName`/`toColumnName`, validated against drizzle by a backend
 * test) and filtered to the columns the table actually has via {@link getTableColumnNames}, so it
 * works for every app's entity types without importing fork-owned entity schema. The entity id is
 * parameterized. Returns `null` if the entity type is not declared or the row does not exist.
 */
export async function resolveEntityScope(
  tx: Tx,
  entityType: ChannelEntityType | ProductEntityType,
  entityId: string,
): Promise<EntityScopeRow | null> {
  // Only entity types this app declares are resolvable.
  if (!(appConfig.entityTypes as readonly string[]).includes(entityType)) return null;

  const table = toTableName(entityType);
  const existing = await getTableColumnNames(tx, table);
  if (!existing.has('id')) return null; // unknown / non-conforming table

  // Logical keys the permission engine may read, filtered to columns the table actually has.
  // `publishedAt` feeds the draft veto in `canEditEntity` (absent column → always published).
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
 * Decide locally whether the user may edit the document's entity.
 *
 * Mirrors the backend `verifyEntityOp`: resolves the entity scope and memberships in one RLS-scoped
 * transaction, then runs the shared permission engine for the `update` action. The decision is computed
 * by exactly the same engine the backend uses, no HTTP round-trip.
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

    // Defense-in-depth: verify tenant match even if RLS is not enforced (e.g. superuser connection).
    if (typeof entity.tenantId === 'string' && entity.tenantId !== ctx.tenantId) return false;

    // Unpublished drafts (publishedAt null) are editable by their author alone. The
    // published-rows lifecycle veto, ahead of the engine (which has no draft vocabulary).
    // Absent column (resolveEntityScope filtered it out) → always published → no-op.
    if (!draftVisibleTo(asRecord(entity), ctx.userId)) return false;

    const createdBy = typeof entity.createdBy === 'string' || entity.createdBy === null ? entity.createdBy : undefined;
    const subject = buildSubject(entityType, entity, {
      id: entity.id,
      createdBy,
      // The row itself: without it, every row-derived grant ('own', public read) fails closed.
      row: asRecord(entity),
    });

    // Collaborative editing confers no system-admin bypass. The same stance the backend's
    // materialize endpoint takes, so the relay and the write it triggers agree.
    const { allowed } = checkAccess({ userId: ctx.userId, isSystemAdmin: false, memberships }, 'update', subject);
    return allowed;
  });
}
