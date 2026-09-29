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
  isProduct,
  type ProductEntityType,
  toColumnName,
  toTableName,
} from 'shared';
import { asRecord } from 'shared/utils/as-record';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import type { DocScope } from '../constants';
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
 * Authorizes a user to edit the document a token asks for, as the backend's `getValidProduct(update)` does: one
 * RLS-scoped transaction reads the entity row and the user's memberships, then the shared permission engine decides.
 * The document's scope comes from the row, never the token: the result is the scope the session, its stored rows and
 * the materialize write use. Null for a missing row, a row in another tenant or organization than the token names,
 * a draft the user did not author, or a row the user may not update.
 *
 * @throws MissingAncestorError if the resolved entity is missing a required ancestor scope.
 */
export async function authorizeDoc(userId: string, requested: DocScope): Promise<DocScope | null> {
  const { entityType } = requested;
  // Tokens are issued for product entities only, the ones a materializer writes.
  if (!isProduct(entityType)) return null;

  return withRlsTx(requested.tenantId, userId, async (tx) => {
    const [entity, memberships] = await Promise.all([
      resolveEntityScope(tx, entityType, requested.entityId),
      loadMemberships(tx, userId),
    ]);

    if (!entity || typeof entity.tenantId !== 'string') return null;
    // Defense in depth: RLS limits the read to the token's tenant, which a superuser connection would not.
    if (entity.tenantId !== requested.tenantId) return null;
    const organizationId = typeof entity.organizationId === 'string' ? entity.organizationId : null;
    if (organizationId !== requested.organizationId) return null;

    // Unpublished drafts are editable by their author alone: a lifecycle veto ahead of the engine, which has no draft vocabulary.
    if (!draftVisibleTo(asRecord(entity), userId)) return null;

    const createdBy = typeof entity.createdBy === 'string' || entity.createdBy === null ? entity.createdBy : undefined;
    const subject = buildSubject(entityType, entity, {
      id: entity.id,
      createdBy,
      // The row itself: without it, every row-derived grant ('own', public read) fails closed.
      row: asRecord(entity),
    });

    // Collaborative editing confers no system-admin bypass, matching the backend materialize endpoint.
    const { allowed } = checkAccess(
      { actorId: userId, isSystemAdmin: false, memberships, scopes: null },
      'update',
      subject,
    );
    if (!allowed) return null;

    return { entityType, entityId: entity.id, tenantId: entity.tenantId, organizationId };
  });
}
