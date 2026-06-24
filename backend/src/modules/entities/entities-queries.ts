import { and, desc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import { type ContextEntityType, hierarchy, roles, type EntityType as SharedEntityType } from 'shared';
import type z from 'zod';
import type { DbContext } from '#/core/context';
import { jsonbIntRaw } from '#/db/utils/jsonb-counters';
import { activitiesTable } from '#/modules/activities/activities-db';
import { contextCountersTable } from '#/modules/entities/context-counters-db';
import type { membershipCountSchema } from '#/schemas';
import type { ResolvableTable, TableWithIdAndSlug } from '#/tables';
import { type entityTables, getEntityTable } from '#/tables';

// ── Types ────────────────────────────────────────────────────────────────

export type EntityType = keyof typeof entityTables;
export type EntityModel<T extends EntityType> = (typeof entityTables)[T]['$inferSelect'];

// ── Helpers ──────────────────────────────────────────────────────────────

function hasSlug(table: ResolvableTable): table is TableWithIdAndSlug {
  return 'slug' in table;
}

function hasDeletedAt(table: ResolvableTable): table is ResolvableTable & { deletedAt: Parameters<typeof isNull>[0] } {
  return 'deletedAt' in table;
}

// ── Context counter queries ──────────────────────────────────────────────

/** Fetch context counter rows by keys (org IDs, project IDs, etc.). */
export const findContextCountersByKeys = async ({ var: { db } }: DbContext, keys: string[]) => {
  return db
    .select({
      contextKey: contextCountersTable.contextKey,
      counts: contextCountersTable.counts,
    })
    .from(contextCountersTable)
    .where(inArray(contextCountersTable.contextKey, keys));
};

/**
 * Returns the SQL select shape for entity counts from contextCountersTable.
 * Reads pre-computed counts from JSONB instead of running COUNT(*) subqueries.
 *
 * JSONB key conventions:
 *   m:{role}   → membership count by role (e.g. m:admin, m:member)
 *   m:pending  → pending invitations count
 *   m:total    → total active members
 *   e:{type}   → child entity count (e.g. e:attachment)
 */
export const getEntityCountsSelect = (entityType: ContextEntityType) => {
  const children = hierarchy.getOrderedDescendants(entityType);
  const col = '"context_counters"."counts"';

  // Build membership JSON: { admin: N, member: N, ..., pending: N, total: N }
  const roleJsonPairs = roles.all.map((role) => `'${role}', ${jsonbIntRaw(col, `m:${role}`)}`).join(', ');

  // Build entity JSON: { attachment: N, ... }
  const entityJsonPairs = children.map((entity) => `'${entity}', ${jsonbIntRaw(col, `e:${entity}`)}`).join(', ');

  const countsSelect = {
    membership: sql<z.infer<typeof membershipCountSchema>>`
      json_build_object(
        ${sql.raw(roleJsonPairs)},
        'pending', ${sql.raw(jsonbIntRaw(col, 'm:pending'))},
        'total', ${sql.raw(jsonbIntRaw(col, 'm:total'))}
      )`,
    entities: sql<Record<(typeof children)[number], number>>`json_build_object(${sql.raw(entityJsonPairs)})`,
  };

  return { countsSelect };
};

/**
 * Fetches aggregated counts for a specific entity from contextCountersTable.
 * Single LEFT JOIN on pre-computed JSONB — no COUNT(*) subqueries.
 */
export const getEntityCounts = async ({ var: { db } }: DbContext, entityType: ContextEntityType, entityId: string) => {
  const { countsSelect } = getEntityCountsSelect(entityType);

  const [counts] = await db
    .select(countsSelect)
    .from(contextCountersTable)
    .where(eq(contextCountersTable.contextKey, entityId));

  // If no row exists yet, return zeroed counts
  if (!counts) {
    const zeroMembership = Object.fromEntries([...roles.all.map((r) => [r, 0]), ['pending', 0], ['total', 0]]);
    const zeroEntities = Object.fromEntries(hierarchy.getOrderedDescendants(entityType).map((e) => [e, 0]));
    return {
      membership: zeroMembership as z.infer<typeof membershipCountSchema>,
      entities: zeroEntities as Record<string, number>,
    };
  }

  return counts;
};

/**
 * Reads a single pre-computed entity count from contextCountersTable.
 * Used for quota checks — reads `e:{entityType}` from the org's counter row.
 */
export const getOrgEntityCount = async ({ var: { db } }: DbContext, orgId: string, entityType: string) => {
  const key = `e:${entityType}`;
  const [row] = await db
    .select({ count: sql<number>`coalesce((${contextCountersTable.counts}->>${key})::int, 0)` })
    .from(contextCountersTable)
    .where(eq(contextCountersTable.contextKey, orgId));
  return row?.count ?? 0;
};

// ── Activity queries ─────────────────────────────────────────────────────

/**
 * Max delete rows to enumerate per catchup before falling back to list invalidation.
 * The delete scan requests `CAP + 1` rows so the caller can detect overflow (more deletes
 * than we are willing to enumerate) and tell the client to invalidate the whole list instead
 * of removing entities one id at a time.
 */
export const DELETE_ENUMERATE_CAP = 200;

/**
 * Scan product-entity delete activities after a cursor (app stream).
 *
 * Capped at `DELETE_ENUMERATE_CAP + 1` so the caller can detect overflow (more deletes than we
 * enumerate) and fall back to client-side list invalidation. Membership changes are intentionally
 * NOT scanned here — they are detected via the `s:membership` seq counter, so membership churn can
 * never consume the delete budget.
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

/**
 * Scan public entity deletes after a cursor.
 *
 * Capped at `DELETE_ENUMERATE_CAP + 1` for overflow detection (same contract as
 * {@link findDeleteActivities}).
 */
export const findPublicDeleteActivities = async (
  { var: { db } }: DbContext,
  cursor: string,
  publicTypes: SharedEntityType[],
) => {
  return db
    .select({ id: activitiesTable.id, entityType: activitiesTable.entityType, subjectId: activitiesTable.subjectId })
    .from(activitiesTable)
    .where(
      and(
        inArray(activitiesTable.entityType, publicTypes as (typeof activitiesTable.entityType.enumValues)[number][]),
        sql`${activitiesTable.action} = 'delete'`,
        gt(activitiesTable.id, cursor),
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

/** Get latest public entity activity ID (for cursor). */
export const findLatestPublicActivityId = async ({ var: { db } }: DbContext, publicTypes: SharedEntityType[]) => {
  const result = await db
    .select({ id: activitiesTable.id })
    .from(activitiesTable)
    .where(inArray(activitiesTable.entityType, publicTypes))
    .orderBy(desc(activitiesTable.id))
    .limit(1);

  return result[0]?.id ?? null;
};

// ── Entity resolution queries ────────────────────────────────────────────

/**
 * @internal Resolves an entity by ID or slug from its table.
 *
 * **Do not use directly in route handlers.** Use the permission-checking wrappers instead:
 * - `getValidContextEntity` for context entities (e.g., organization)
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

/** @internal Resolves multiple entities by IDs. See `resolveEntity` for usage guidelines. */
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
    .where(sql`seq > ${afterSeq} AND organization_id = ${organizationId}`);

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
    WHERE seq > ${afterSeq} AND organization_id = ${organizationId}
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
