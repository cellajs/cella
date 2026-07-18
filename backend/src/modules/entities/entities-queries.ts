import { and, count, desc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import { type ChannelEntityType, hierarchy, roles, type EntityType as SharedEntityType } from 'shared';
import type z from 'zod';
import type { DbContext } from '#/core/context';
import { jsonbIntRaw } from '#/db/utils/jsonb-counters';
import { hasPublishedAt } from '#/db/utils/published-predicate';
import { activitiesTable } from '#/modules/activities/activities-db';
import { channelCountersTable } from '#/modules/entities/channel-counters-db';
import type { membershipCountSchema } from '#/schemas';
import type { EntityModel, EntityType, ResolvableTable, TableWithIdAndSlug } from '#/tables';
import { getEntityTable } from '#/tables';

// Helpers

function hasSlug(table: ResolvableTable): table is TableWithIdAndSlug {
  return 'slug' in table;
}

function hasDeletedAt(table: ResolvableTable): table is ResolvableTable & { deletedAt: Parameters<typeof isNull>[0] } {
  return 'deletedAt' in table;
}

// Context counter queries

/** Fetch context counter rows by keys (org IDs, project IDs, etc.). */
export const findChannelCountersByKeys = async ({ var: { db } }: DbContext, keys: string[]) => {
  return db
    .select({
      channelKey: channelCountersTable.channelKey,
      counts: channelCountersTable.counts,
      // Canonical id-path (CDC-maintained): lets catchup verify claimed view ancestry.
      path: channelCountersTable.path,
    })
    .from(channelCountersTable)
    .where(inArray(channelCountersTable.channelKey, keys));
};

/**
 * Returns the SQL select shape for entity counts from channelCountersTable.
 * Reads pre-computed counts from JSONB without running COUNT(*) subqueries.
 *
 * JSONB key conventions:
 *   m:{role}  → membership count by role (e.g. m:admin, m:member)
 *   m:pending → pending invitations count
 *   m:total   → total active members
 *   e:{type}  → child entity count (e.g. e:attachment; countable rows must be live AND
 *               published on draft-lifecycle tables)
 *   li:{type} → epoch ms of the latest countable row born in the context's OWN stream
 *               (publish time on draft-lifecycle tables, else created time)
 *   lu:{type} → epoch ms of the latest countable-row content update in that stream
 *               (product types only). Stamped at the home context (deepest non-null
 *               ancestor). These stamps do not propagate to higher ancestors like
 *               e: deltas are; they are per-stream signals.
 */
export const getEntityCountsSelect = (entityType: ChannelEntityType) => {
  const children = hierarchy.getOrderedDescendants(entityType);
  const productChildren = children.filter((child) => hierarchy.isProduct(child));
  const col = '"channel_counters"."counts"';

  // Build membership JSON: { admin: N, member: N, ..., pending: N, total: N }
  const roleJsonPairs = roles.all.map((role) => `'${role}', ${jsonbIntRaw(col, `m:${role}`)}`).join(', ');

  // Build entity JSON: { attachment: N, ... }
  const entityJsonPairs = children.map((entity) => `'${entity}', ${jsonbIntRaw(col, `e:${entity}`)}`).join(', ');

  // Build activity JSON over product descendants only: { attachment: { created: epochMs | null, updated: epochMs | null }, ... }
  const activityJsonPairs = productChildren
    .map(
      (entity) =>
        `'${entity}', json_build_object('created', (${col}->>'li:${entity}')::bigint, 'updated', (${col}->>'lu:${entity}')::bigint)`,
    )
    .join(', ');

  const countsSelect = {
    membership: sql<z.infer<typeof membershipCountSchema>>`
      json_build_object(
        ${sql.raw(roleJsonPairs)},
        'pending', ${sql.raw(jsonbIntRaw(col, 'm:pending'))},
        'total', ${sql.raw(jsonbIntRaw(col, 'm:total'))}
      )`,
    entities: sql<Record<(typeof children)[number], number>>`json_build_object(${sql.raw(entityJsonPairs)})`,
    activity: sql<
      Record<(typeof productChildren)[number], { created: number | null; updated: number | null }>
    >`json_build_object(${sql.raw(activityJsonPairs)})`,
  };

  return { countsSelect };
};

/**
 * Fetches aggregated counts for a specific entity from channelCountersTable.
 * Single LEFT JOIN on pre-computed JSONB, no COUNT(*) subqueries.
 */
export const getEntityCounts = async ({ var: { db } }: DbContext, entityType: ChannelEntityType, entityId: string) => {
  const { countsSelect } = getEntityCountsSelect(entityType);

  const [counts] = await db
    .select(countsSelect)
    .from(channelCountersTable)
    .where(eq(channelCountersTable.channelKey, entityId));

  // If no row exists yet, return zeroed counts (activity stamps are null until a first post)
  if (!counts) {
    const descendants = hierarchy.getOrderedDescendants(entityType);
    const zeroMembership = Object.fromEntries([...roles.all.map((r) => [r, 0]), ['pending', 0], ['total', 0]]);
    const zeroEntities = Object.fromEntries(descendants.map((e) => [e, 0]));
    const nullActivity = Object.fromEntries(
      descendants.filter((e) => hierarchy.isProduct(e)).map((e) => [e, { created: null, updated: null }]),
    );
    return {
      membership: zeroMembership as z.infer<typeof membershipCountSchema>,
      entities: zeroEntities as Record<string, number>,
      activity: nullActivity as Record<string, { created: number | null; updated: number | null }>,
    };
  }

  return counts;
};

/**
 * Reads a single pre-computed entity count from channelCountersTable.
 * Used for quota checks: reads `e:{entityType}` from the org's counter row.
 *
 * Draft-lifecycle tables (opt-in `publishedAt`) fall back to a direct COUNT over live
 * rows INCLUDING drafts: the `e:` counter tracks published rows only, but a quota must
 * bound total storage, not published visibility. This prevents drafts from stockpiling for free.
 */
export const getOrgEntityCount = async (ctx: DbContext, orgId: string, entityType: EntityType) => {
  const { db } = ctx.var;

  const table = hierarchy.isProduct(entityType) ? getEntityTable(entityType) : null;
  if (table && hasPublishedAt(table)) {
    const deletedFilter = hasDeletedAt(table) ? sql.raw(' AND deleted_at IS NULL') : sql.raw('');
    const [row] = await db
      .select({ count: count() })
      .from(table)
      .where(sql`organization_id = ${orgId}${deletedFilter}`);
    return row?.count ?? 0;
  }

  const key = `e:${entityType}`;
  const [row] = await db
    .select({ count: sql<number>`coalesce((${channelCountersTable.counts}->>${key})::int, 0)` })
    .from(channelCountersTable)
    .where(eq(channelCountersTable.channelKey, orgId));
  return row?.count ?? 0;
};

// Activity queries

/**
 * Max delete rows to enumerate per catchup before falling back to list invalidation.
 * The delete scan requests `CAP + 1` rows so the caller can detect overflow (more deletes
 * than we are willing to enumerate) and tell the client to invalidate the whole list without
 * removing entities one id at a time.
 */
export const DELETE_ENUMERATE_CAP = 200;

/**
 * Scan product entity delete activities after a cursor (app stream), capped at
 * `DELETE_ENUMERATE_CAP + 1` so the caller can detect overflow and fall back to list invalidation.
 * Membership changes are excluded here and detected via the `membership` seq counter, so
 * membership churn never consumes the delete budget.
 */
export const findDeleteActivities = async (
  { var: { db } }: DbContext,
  cursor: string,
  organizationIds: string[],
  productEntityTypes: SharedEntityType[],
) => {
  return db
    .select({
      id: activitiesTable.id,
      organizationId: activitiesTable.organizationId,
      subjectId: activitiesTable.subjectId,
      entityType: activitiesTable.entityType,
    })
    .from(activitiesTable)
    .where(
      and(
        gt(activitiesTable.id, cursor),
        inArray(activitiesTable.organizationId, organizationIds),
        inArray(activitiesTable.entityType, productEntityTypes),
        sql`${activitiesTable.action} = 'delete'`,
      ),
    )
    .orderBy(activitiesTable.id)
    .limit(DELETE_ENUMERATE_CAP + 1);
};

/** Get the latest activity ID relevant to a user's organizations. */
export const findLatestUserActivityId = async (
  { var: { db } }: DbContext,
  organizationIds: string[],
  entityTypes: SharedEntityType[],
) => {
  const result = await db
    .select({ id: activitiesTable.id })
    .from(activitiesTable)
    .where(
      or(
        and(eq(activitiesTable.resourceType, 'membership'), inArray(activitiesTable.organizationId, organizationIds)),
        and(inArray(activitiesTable.entityType, entityTypes), inArray(activitiesTable.organizationId, organizationIds)),
      ),
    )
    .orderBy(desc(activitiesTable.id))
    .limit(1);

  return result[0]?.id ?? null;
};

// Entity resolution queries

/**
 * @internal Resolves an entity by ID or slug from its table.
 *
 * **Do not use directly in route handlers.** Use these permission-checking wrappers:
 * - `getValidChannelEntity` for channel entities (e.g., organization)
 * - `getValidProductEntity` for product entities (e.g., attachment, page)
 *
 * Direct usage is only appropriate in internal utilities (e.g., slug availability checks)
 * or self-operations where the user acts on their own data without permission checks.
 */
export async function resolveEntity<T extends EntityType>(
  { var: { db } }: DbContext,
  entityType: T,
  identifier: string,
  bySlug = false,
): Promise<EntityModel<T> | undefined> {
  const table = getEntityTable(entityType);

  const identityCondition = bySlug && hasSlug(table) ? eq(table.slug, identifier) : eq(table.id, identifier);
  const condition = hasDeletedAt(table) ? and(identityCondition, isNull(table.deletedAt)) : identityCondition;

  const [entity] = await db
    .select()
    // biome-ignore lint/suspicious/noExplicitAny: Drizzle .from() rejects generic table types (https://github.com/drizzle-team/drizzle-orm/issues/4367)
    .from(table as any)
    .where(condition);
  return entity as EntityModel<T> | undefined;
}

/** @internal Resolves multiple entities by IDs. See {@link resolveEntity} for usage guidelines. */
export async function resolveEntities<T extends EntityType>(
  { var: { db } }: DbContext,
  entityType: T,
  ids: string[],
): Promise<Array<EntityModel<T>>> {
  if (!ids.length) return [];

  const table = getEntityTable(entityType);
  const condition = hasDeletedAt(table) ? and(inArray(table.id, ids), isNull(table.deletedAt)) : inArray(table.id, ids);

  const entities = await db
    .select()
    // biome-ignore lint/suspicious/noExplicitAny: Drizzle .from() rejects generic table types (https://github.com/drizzle-team/drizzle-orm/issues/4367)
    .from(table as any)
    .where(condition);
  return entities as Array<EntityModel<T>>;
}

/**
 * Draft-exclusion fragment for catchup/delta scans: drafts are outside the sync engine,
 * so their seq bumps must never surface ids to sync back. Empty for tables without the column.
 */
const publishedSqlFilter = (table: ResolvableTable) =>
  hasPublishedAt(table) ? sql.raw(' AND published_at IS NOT NULL') : sql.raw('');

/** Fetch IDs of entities that changed since a given seq. Lightweight ID-only query. */
export const findChangedEntityIds = async (
  { var: { db } }: DbContext,
  entityType: EntityType,
  organizationId: string,
  afterSeq: number,
) => {
  const table = getEntityTable(entityType);

  const rows = await db
    .select({ id: table.id })
    .from(table)
    .where(sql`seq > ${afterSeq} AND organization_id = ${organizationId}${publishedSqlFilter(table)}`);

  return rows.map((r) => r.id);
};

/** Fetch IDs of entities that changed since a seq, split into live updates and soft-delete tombstones. */
export const findChangedEntityDeltaIds = async (
  { var: { db } }: DbContext,
  entityType: EntityType,
  organizationId: string,
  afterSeq: number,
) => {
  const table = getEntityTable(entityType);
  const deletedAtSelect = hasDeletedAt(table) ? sql.raw('deleted_at') : sql.raw('NULL');

  const result = await db.execute<{ id: string; deletedAt: string | null }>(sql`
    SELECT id, ${deletedAtSelect} AS "deletedAt"
    FROM ${table}
    WHERE seq > ${afterSeq} AND organization_id = ${organizationId}${publishedSqlFilter(table)}
  `);

  const updatedIds: string[] = [];
  const deletedIds: string[] = [];

  for (const row of result.rows) {
    if (row.deletedAt) {
      deletedIds.push(row.id);
    } else {
      updatedIds.push(row.id);
    }
  }

  return { updatedIds, deletedIds };
};
