import type pg from 'pg';
import {
  appConfig,
  buildSubject,
  checkPermission,
  type ChannelEntityIdColumns,
  type ChannelEntityType,
  draftVisibleTo,
  hierarchy,
  isChannelEntity,
  isProductEntity,
  type PermissionMembership,
  type ProductEntityType,
  toColumnName,
  toTableName,
} from 'shared';
import type { DocContext } from '../constants';
import { withClient } from './db';

/**
 * Column names that exist on a table, read once from Postgres and cached per process.
 *
 * Lets the relay select only the columns a table actually has (each fork's entities differ)
 * without importing backend drizzle schema. The DB is
 * the source of truth, so this stays correct across forks and migrations.
 */
const tableColumnsCache = new Map<string, Promise<Set<string>>>();

export function getTableColumnNames(client: pg.PoolClient, table: string): Promise<Set<string>> {
  let cached = tableColumnsCache.get(table);
  if (!cached) {
    cached = client
      .query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
        [table],
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
 * Runs on an RLS-scoped client (tenant + user already set by {@link withClient}), so the result is
 * naturally limited to the active tenant. Only the three columns the engine reads are selected.
 */
export async function loadMemberships(client: pg.PoolClient, userId: string): Promise<PermissionMembership[]> {
  const table = toTableName('membership');
  const channelType = toColumnName('channelType');
  const channelId = toColumnName('channelId');
  const role = toColumnName('role');
  const userIdColumn = toColumnName('userId');
  const projection = `"${channelType}" AS "channelType", "${channelId}" AS "channelId", "${role}" AS "role"`;
  const { rows } = await client.query<PermissionMembership>(
    `SELECT ${projection} FROM "${table}" WHERE "${userIdColumn}" = $1`,
    [userId],
  );
  return rows;
}

/** Entity row carrying just the ancestor scope and ownership columns the permission engine needs. */
export interface EntityScopeRow extends Partial<ChannelEntityIdColumns> {
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
 * works for every fork's entity types without importing backend drizzle schema. The entity id is
 * parameterized. Returns `null` if the entity type is not declared or the row does not exist.
 */
export async function resolveEntityScope(
  client: pg.PoolClient,
  entityType: ChannelEntityType | ProductEntityType,
  entityId: string,
): Promise<EntityScopeRow | null> {
  // Only entity types this app declares are resolvable.
  if (!(appConfig.entityTypes as readonly string[]).includes(entityType)) return null;

  const table = toTableName(entityType);
  const existing = await getTableColumnNames(client, table);
  if (!existing.has('id')) return null; // unknown / non-conforming table

  // Logical keys the permission engine may read, filtered to columns the table actually has.
  // `publishedAt` feeds the draft veto in `canEditEntity` (absent column → always published).
  const candidateKeys = ['id', 'createdBy', 'tenantId', 'publishedAt'];
  for (const ancestor of hierarchy.getOrderedAncestors(entityType)) {
    candidateKeys.push(appConfig.entityIdColumnKeys[ancestor]);
  }
  const selectKeys = candidateKeys.filter((key) => existing.has(toColumnName(key)));

  const projection = selectKeys.map((key) => `"${toColumnName(key)}" AS "${key}"`).join(', ');
  const { rows } = await client.query<EntityScopeRow>(
    `SELECT ${projection} FROM "${table}" WHERE "id" = $1 LIMIT 1`,
    [entityId],
  );
  return rows[0] ?? null;
}

/**
 * Decide locally whether the user may edit the document's entity.
 *
 * Mirrors the backend `verifyEntityOp`: resolves the entity scope and memberships in one RLS-scoped
 * connection, then runs the shared permission engine for the `update` action. The decision is computed
 * by exactly the same engine the backend uses, no HTTP round-trip.
 *
 * @throws MissingScopeError if the resolved entity is missing a required ancestor scope.
 */
export async function canEditEntity(ctx: DocContext): Promise<boolean> {
  const { entityType } = ctx;
  if (!isChannelEntity(entityType) && !isProductEntity(entityType)) return false;

  return withClient(ctx.tenantId, ctx.userId, async (client) => {
    const [entity, memberships] = await Promise.all([
      resolveEntityScope(client, entityType, ctx.entityId),
      loadMemberships(client, ctx.userId),
    ]);

    if (!entity) return false;

    // Defense-in-depth: verify tenant match even if RLS is not enforced (e.g. superuser connection).
    if (typeof entity.tenantId === 'string' && entity.tenantId !== ctx.tenantId) return false;

    // Unpublished drafts (publishedAt null) are editable by their author alone. The
    // published-rows lifecycle veto, ahead of the engine (which has no draft vocabulary).
    // Absent column (resolveEntityScope filtered it out) → always published → no-op.
    if (!draftVisibleTo(entity as unknown as Record<string, unknown>, ctx.userId)) return false;

    const createdBy = typeof entity.createdBy === 'string' || entity.createdBy === null ? entity.createdBy : undefined;
    const subject = buildSubject(entityType, entity, {
      id: entity.id,
      createdBy,
      // The row itself: without it, every row-derived grant ('own', public read) fails closed.
      row: entity as unknown as Record<string, unknown>,
    });

    // Collaborative editing confers no system-admin bypass. The same stance the backend's
    // materialize endpoint takes, so the relay and the write it triggers agree.
    const { isAllowed } = checkPermission(memberships, 'update', subject, {
      userId: ctx.userId,
      isSystemAdmin: false,
    });
    return isAllowed;
  });
}
