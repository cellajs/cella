import type { z } from '@hono/zod-openapi';
import { type AnyColumn, and, count, desc, eq, inArray, isNull, or, type SQL, sql } from 'drizzle-orm';
import { type ChannelEntityType, type EntityType, hierarchy, isProduct, type ProductEntityType, roles } from 'shared';
import type { ActorContext, DbContext } from '#/core/context';
import { tenantReadUnlessInTransaction } from '#/db/tenant-context';
import { jsonbIntRaw } from '#/db/utils/jsonb-counters';
import { hasPublishedAt, publishedRowsPredicate } from '#/db/utils/published-predicate';
import { activitiesTable } from '#/modules/activities/activities-db';
import { channelCountersTable } from '#/modules/entities/channel-counters-db';
import { zeroChannelCounts } from '#/modules/entities/helpers/build-zero-counts';
import { productCountersTable } from '#/modules/entities/product-counters-db';
import { syncStateTable } from '#/modules/entities/sync-state-db';
import type { membershipCountSchema } from '#/schemas';
import type { EntityModel, ResolvableTable, TableWithIdAndSlug } from '#/tables';
import { getEntityTable } from '#/tables';

const hasSlug = (table: ResolvableTable): table is TableWithIdAndSlug => 'slug' in table;

const hasDeletedAt = (table: ResolvableTable): table is ResolvableTable & { deletedAt: Parameters<typeof isNull>[0] } => 'deletedAt' in table;

// Channel counter queries

interface FindChannelCountersByKeysOpts {
  keys: string[];
}

/** The counter rows of the given channel keys; a key without a row is left out. */
export const findChannelCountersByKeys = async (ctx: DbContext, { keys }: FindChannelCountersByKeysOpts) => {
  const { db } = ctx.var;
  return db
    .select({
      channelKey: channelCountersTable.channelKey,
      counts: channelCountersTable.counts,
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

  const entitySelfJsonPairs = children.map((entity) => `'${entity}', ${jsonbIntRaw(col, `e:c:h:${entity}`)}`).join(', ');

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

/** How many users viewed a product; 0 before the first view. */
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
export const productViewCountSelect = () => sql<number>`coalesce(${productCountersTable.viewCount}, 0)`.as('view_count');

/** The join condition of `product_counters` on a product id column, for {@link productViewCountSelect}. */
export const productViewCountJoin = (productIdColumn: AnyColumn) => eq(productCountersTable.productId, productIdColumn);

interface GetChannelCountsOpts {
  entityType: ChannelEntityType;
  entityId: string;
}

/** The counts of one channel from its counter row; zeros while CDC has written none. */
export const getChannelCounts = async (ctx: DbContext, { entityType, entityId }: GetChannelCountsOpts) => {
  const { db } = ctx.var;
  const { countsSelect } = getChannelCountsSelect(entityType);

  const [counts] = await db.select(countsSelect).from(channelCountersTable).where(eq(channelCountersTable.channelKey, entityId));
  return counts ?? zeroChannelCounts(entityType);
};

interface GetOrganizationEntityCountOpts {
  organizationId: string;
  entityType: EntityType;
}

/**
 * Reads `e:c:{entityType}` from the org's counter row. Draft-lifecycle tables fall back to a
 * direct COUNT including drafts, since that counter tracks published rows only. A product table sits
 * under RLS, where a bare connection reads no row, so on one the count opens its own tenant transaction.
 */
export const getOrganizationEntityCount = async (ctx: ActorContext, { organizationId, entityType }: GetOrganizationEntityCountOpts) => {
  const table = isProduct(entityType) ? getEntityTable(entityType) : null;
  if (table && hasPublishedAt(table)) {
    const countRows = async (readCtx: DbContext) => {
      const deletedFilter = hasDeletedAt(table) ? sql.raw(' AND deleted_at IS NULL') : sql.raw('');
      const [row] = await readCtx.var.db.select({ count: count() }).from(table).where(sql`organization_id = ${organizationId}${deletedFilter}`);
      return row.count;
    };
    return tenantReadUnlessInTransaction(ctx, countRows);
  }

  const { db } = ctx.var;
  const [row] = await db
    .select({ count: sql<number>`${sql.raw(jsonbIntRaw('"channel_counters"."counts"', `e:c:${entityType}`))}` })
    .from(channelCountersTable)
    .where(eq(channelCountersTable.channelKey, organizationId));
  return row?.count ?? 0;
};

// Activity queries

interface FindLatestActivityIdOpts {
  organizationIds: string[];
  entityTypes: EntityType[];
}

/** The newest activity id of the organizations' membership changes and of the given entity types; null when there is none. */
export const findLatestActivityId = async (ctx: DbContext, { organizationIds, entityTypes }: FindLatestActivityIdOpts) => {
  const { db } = ctx.var;
  const result = await db
    .select({ id: activitiesTable.id })
    .from(activitiesTable)
    .where(
      and(
        inArray(activitiesTable.organizationId, organizationIds),
        or(eq(activitiesTable.resourceType, 'membership'), inArray(activitiesTable.entityType, entityTypes)),
      ),
    )
    .orderBy(desc(activitiesTable.id))
    .limit(1);

  return result[0]?.id ?? null;
};

/**
 * The generation of the sync books. The CDC worker moves it on whenever it rebuilt them, and a client that holds
 * another one refetches.
 * @param ctx - Carries the connection to read on.
 * @returns The generation, 1 on a database whose books were never rebuilt.
 */
export const findSyncGeneration = async (ctx: DbContext): Promise<number> => {
  const [state] = await ctx.var.db.select({ generation: syncStateTable.generation }).from(syncStateTable).limit(1);
  return state?.generation ?? 1;
};

// Entity resolution queries

interface ResolveEntityOpts<T extends EntityType> {
  entityType: T;
  identifier: string;
  bySlug?: boolean;
  /** Locks the row until the caller's transaction ends; needs a read-write transaction. */
  forUpdate?: boolean;
}

/**
 * @internal Never call this from a route handler: it runs no permission check. Use the
 * `getValidChannel` / `getValidProduct` wrappers there, and this only in internal utilities
 * such as slug availability, or self-operations on the caller's own data.
 */
export const resolveEntity = async <T extends EntityType>(
  ctx: DbContext,
  { entityType, identifier, bySlug = false, forUpdate = false }: ResolveEntityOpts<T>,
): Promise<EntityModel<T> | undefined> => {
  const { db } = ctx.var;
  const table = getEntityTable(entityType);

  const identityCondition = bySlug && hasSlug(table) ? eq(table.slug, identifier) : eq(table.id, identifier);
  const condition = hasDeletedAt(table) ? and(identityCondition, isNull(table.deletedAt)) : identityCondition;

  const query = db
    .select()
    // biome-ignore lint/suspicious/noExplicitAny: Drizzle .from() rejects generic table types (https://github.com/drizzle-team/drizzle-orm/issues/4367)
    .from(table as any)
    .where(condition);
  // The lock an UPDATE of non-key columns takes: writers of the row wait, inserts that reference it do not.
  const [entity] = forUpdate ? await query.for('no key update') : await query;
  return entity as EntityModel<T> | undefined;
};

interface ResolveEntitiesOpts<T extends EntityType> {
  entityType: T;
  ids: string[];
}

/** @internal See {@link resolveEntity} for usage guidelines. */
export const resolveEntities = async <T extends EntityType>(
  ctx: DbContext,
  { entityType, ids }: ResolveEntitiesOpts<T>,
): Promise<Array<EntityModel<T>>> => {
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
};

interface FindChangedEntityDeltaIdsOpts {
  entityType: ProductEntityType;
  organizationId: string;
  afterSeq: number;
  /** The rows the caller may read (`buildCollectionReadWhere`); unset reads every row of the organization. */
  readWhere?: SQL;
}

/**
 * The ids of an organization's rows stamped after `afterSeq`, split into live rows and soft-delete tombstones. A
 * tombstone is read only in a transaction that includes deleted rows.
 */
export const findChangedEntityDeltaIds = async (
  ctx: DbContext,
  { entityType, organizationId, afterSeq, readWhere }: FindChangedEntityDeltaIdsOpts,
) => {
  const { db } = ctx.var;
  const table = getEntityTable(entityType);
  const deletedAtSelect = hasDeletedAt(table) ? sql.raw('deleted_at') : sql.raw('NULL');
  // Drafts are outside the sync engine, so their seq bumps must not yield ids to sync back.
  const published = publishedRowsPredicate(table);

  const result = await db.execute<{ id: string; deletedAt: string | null }>(sql`
    SELECT id, ${deletedAtSelect} AS "deletedAt"
    FROM ${table}
    WHERE seq > ${afterSeq} AND organization_id = ${organizationId}${published ? sql` AND ${published}` : sql``}${readWhere ? sql` AND ${readWhere}` : sql``}
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
