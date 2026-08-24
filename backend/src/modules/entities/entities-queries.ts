import { type AnyColumn, and, count, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { type ChannelEntityType, hierarchy, isProduct, roles, type EntityType as SharedEntityType } from 'shared';
import type z from 'zod';
import type { DbContext } from '#/core/context';
import { jsonbIntRaw } from '#/db/utils/jsonb-counters';
import { hasPublishedAt } from '#/db/utils/published-predicate';
import { activitiesTable } from '#/modules/activities/activities-db';
import { channelCountersTable } from '#/modules/entities/channel-counters-db';
import { productCountersTable } from '#/modules/entities/product-counters-db';
import type { membershipCountSchema } from '#/schemas';
import type { EntityModel, EntityType, ResolvableTable, TableWithIdAndSlug } from '#/tables';
import { getEntityTable } from '#/tables';

function hasSlug(table: ResolvableTable): table is TableWithIdAndSlug {
  return 'slug' in table;
}

function hasDeletedAt(table: ResolvableTable): table is ResolvableTable & { deletedAt: Parameters<typeof isNull>[0] } {
  return 'deletedAt' in table;
}

// Context counter queries

interface FindChannelCountersByKeysOpts {
  keys: string[];
}

export const findChannelCountersByKeys = async (ctx: DbContext, { keys }: FindChannelCountersByKeysOpts) => {
  const { db } = ctx.var;
  return db
    .select({
      channelKey: channelCountersTable.channelKey,
      counts: channelCountersTable.counts,
      // CDC-maintained canonical id-path: lets catchup verify a claimed view's ancestry.
      path: channelCountersTable.path,
    })
    .from(channelCountersTable)
    .where(inArray(channelCountersTable.channelKey, keys));
};

/** Projects precomputed values from `channelCountersTable`, avoiding per-request aggregates. */
export const getChannelCountsSelect = (entityType: ChannelEntityType) => {
  const children = hierarchy.getOrderedDescendants(entityType);
  const productChildren = children.filter((child) => isProduct(child));
  const col = '"channel_counters"."counts"';

  // { admin: N, member: N, ..., pending: N, total: N }
  const roleJsonPairs = roles.all.map((role) => `'${role}', ${jsonbIntRaw(col, `m:c:${role}`)}`).join(', ');

  // { attachment: N, ... }
  const entityJsonPairs = children.map((entity) => `'${entity}', ${jsonbIntRaw(col, `e:c:${entity}`)}`).join(', ');

  // Home-only twin of `entities` from the `e:c:h:` keys: rows homed directly at the channel, no descendant rollup.
  const entitySelfJsonPairs = children
    .map((entity) => `'${entity}', ${jsonbIntRaw(col, `e:c:h:${entity}`)}`)
    .join(', ');

  // Product descendants only: { attachment: { created: epochMs | null, updated: epochMs | null }, ... }
  const activityJsonPairs = productChildren
    .map(
      (entity) =>
        `'${entity}', json_build_object('created', (${col}->>'e:li:h:${entity}')::bigint, 'updated', (${col}->>'e:lu:h:${entity}')::bigint)`,
    )
    .join(', ');

  const countsSelect = {
    membership: sql<z.infer<typeof membershipCountSchema>>`
      json_build_object(
        ${sql.raw(roleJsonPairs)},
        'pending', ${sql.raw(jsonbIntRaw(col, 'm:c:pending'))},
        'total', ${sql.raw(jsonbIntRaw(col, 'm:c:total'))}
      )`,
    entities: sql<Record<(typeof children)[number], number>>`json_build_object(${sql.raw(entityJsonPairs)})`,
    entitiesSelf: sql<Record<(typeof children)[number], number>>`json_build_object(${sql.raw(entitySelfJsonPairs)})`,
    activity: sql<
      Record<(typeof productChildren)[number], { created: number | null; updated: number | null }>
    >`json_build_object(${sql.raw(activityJsonPairs)})`,
  };

  return { countsSelect };
};

// Product view-count queries: product_counters lives here and every product module reuses these

interface FindProductViewCountOpts {
  productId: string;
}

export const findProductViewCount = async (ctx: DbContext, { productId }: FindProductViewCountOpts) => {
  const { db } = ctx.var;
  const [counters] = await db
    .select({ viewCount: productCountersTable.viewCount })
    .from(productCountersTable)
    .where(eq(productCountersTable.productId, productId))
    .limit(1);
  return counters?.viewCount ?? 0;
};

/** Pair with {@link productViewCountJoin}. */
export const productViewCountSelect = () =>
  sql<number>`coalesce(${productCountersTable.viewCount}, 0)`.as('view_count');

export const productViewCountJoin = (productIdColumn: AnyColumn) => eq(productCountersTable.productId, productIdColumn);

interface GetChannelCountsOpts {
  entityType: ChannelEntityType;
  entityId: string;
}

/** One LEFT JOIN on pre-computed JSONB, no COUNT(*) subqueries. */
export const getChannelCounts = async (ctx: DbContext, { entityType, entityId }: GetChannelCountsOpts) => {
  const { db } = ctx.var;
  const { countsSelect } = getChannelCountsSelect(entityType);

  const [counts] = await db
    .select(countsSelect)
    .from(channelCountersTable)
    .where(eq(channelCountersTable.channelKey, entityId));

  // No row yet: activity stamps stay null until a first post.
  if (!counts) {
    const descendants = hierarchy.getOrderedDescendants(entityType);
    const zeroMembership = Object.fromEntries([...roles.all.map((r) => [r, 0]), ['pending', 0], ['total', 0]]);
    const zeroEntities = Object.fromEntries(descendants.map((e) => [e, 0]));
    const nullActivity = Object.fromEntries(
      descendants.filter((e) => isProduct(e)).map((e) => [e, { created: null, updated: null }]),
    );
    return {
      membership: zeroMembership as z.infer<typeof membershipCountSchema>,
      entities: zeroEntities as Record<string, number>,
      entitiesSelf: { ...zeroEntities } as Record<string, number>,
      activity: nullActivity as Record<string, { created: number | null; updated: number | null }>,
    };
  }

  return counts;
};

interface GetOrganizationEntityCountOpts {
  organizationId: string;
  entityType: EntityType;
}

/**
 * Reads `e:c:{entityType}` from the org's counter row. Draft-lifecycle tables fall back to a
 * direct COUNT including drafts, since that counter tracks published rows only.
 */
export const getOrganizationEntityCount = async (
  ctx: DbContext,
  { organizationId, entityType }: GetOrganizationEntityCountOpts,
) => {
  const { db } = ctx.var;

  const table = isProduct(entityType) ? getEntityTable(entityType) : null;
  if (table && hasPublishedAt(table)) {
    const deletedFilter = hasDeletedAt(table) ? sql.raw(' AND deleted_at IS NULL') : sql.raw('');
    const [row] = await db
      .select({ count: count() })
      .from(table)
      .where(sql`organization_id = ${organizationId}${deletedFilter}`);
    return row?.count ?? 0;
  }

  const key = `e:c:${entityType}`;
  const [row] = await db
    .select({ count: sql<number>`coalesce((${channelCountersTable.counts}->>${key})::int, 0)` })
    .from(channelCountersTable)
    .where(eq(channelCountersTable.channelKey, organizationId));
  return row?.count ?? 0;
};

// Activity queries

interface FindLatestUserActivityIdOpts {
  organizationIds: string[];
  entityTypes: SharedEntityType[];
}

export const findLatestUserActivityId = async (
  ctx: DbContext,
  { organizationIds, entityTypes }: FindLatestUserActivityIdOpts,
) => {
  const { db } = ctx.var;
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

interface ResolveEntityOpts<T extends EntityType> {
  entityType: T;
  identifier: string;
  bySlug?: boolean;
}

/**
 * @internal Never call this from a route handler: it runs no permission check. Use the
 * `getValidChannel` / `getValidProduct` wrappers there, and this only in internal utilities
 * such as slug availability, or self-operations on the caller's own data.
 */
export async function resolveEntity<T extends EntityType>(
  ctx: DbContext,
  { entityType, identifier, bySlug = false }: ResolveEntityOpts<T>,
): Promise<EntityModel<T> | undefined> {
  const { db } = ctx.var;
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

interface ResolveEntitiesOpts<T extends EntityType> {
  entityType: T;
  ids: string[];
}

/** @internal See {@link resolveEntity} for usage guidelines. */
export async function resolveEntities<T extends EntityType>(
  ctx: DbContext,
  { entityType, ids }: ResolveEntitiesOpts<T>,
): Promise<Array<EntityModel<T>>> {
  const { db } = ctx.var;
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

/** Drafts are outside the sync engine, so their seq bumps must not yield ids to sync back. */
const publishedSqlFilter = (table: ResolvableTable) =>
  hasPublishedAt(table) ? sql.raw(' AND published_at IS NOT NULL') : sql.raw('');

interface FindChangedEntityIdsOpts {
  entityType: EntityType;
  organizationId: string;
  afterSeq: number;
}

export const findChangedEntityIds = async (
  ctx: DbContext,
  { entityType, organizationId, afterSeq }: FindChangedEntityIdsOpts,
) => {
  const { db } = ctx.var;
  const table = getEntityTable(entityType);

  const rows = await db
    .select({ id: table.id })
    .from(table)
    .where(sql`seq > ${afterSeq} AND organization_id = ${organizationId}${publishedSqlFilter(table)}`);

  return rows.map((r) => r.id);
};

/** Split into live updates and soft-delete tombstones. */
export const findChangedEntityDeltaIds = async (
  ctx: DbContext,
  { entityType, organizationId, afterSeq }: FindChangedEntityIdsOpts,
) => {
  const { db } = ctx.var;
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
