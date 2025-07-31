import { appConfig, type ContextEntityType, type ProductEntityType } from 'config';
import { and, count, eq, isNotNull, isNull, type SelectedFields, type SQL, type SQLWrapper, sql } from 'drizzle-orm';
import type { PgColumn, SubqueryWithSelection } from 'drizzle-orm/pg-core';
import { db } from '#/db/db';
import { membershipsTable } from '#/db/schema/memberships';
import { organizationsTable } from '#/db/schema/organizations';
import { tokensTable } from '#/db/schema/tokens';
import { entityTables } from '#/entity-config';
import { getRelatedEntities, type ValidEntities } from '#/modules/entities/helpers/get-related-entities';

type EntityIdColumnNames = keyof (typeof membershipsTable)['_']['columns'];

/**
 * Generates a query to count the number of admins and members for a specific entity.
 * If an entity is provided, counts are filtered by entity. Otherwise, counts are for all entities.
 *
 * @param entity - The entity type to filter by, or null for counting all entities.
 * @returns Query object that can be executed
 */
export const getMemberCountsQuery = (entityType: ContextEntityType) => {
  const targetEntityIdField = appConfig.entityIdFields[entityType];
  const entityIdColumn = membershipsTable[targetEntityIdField as EntityIdColumnNames];
  if (!entityIdColumn) throw new Error(`Entity ${entityType} does not have an ID column defined`);

  // Subquery to count pending invitations
  const inviteCountSubquery = db
    .select({
      id: tokensTable[targetEntityIdField],
      invites: count().as('invites'),
    })
    .from(tokensTable)
    .where(and(eq(tokensTable.type, 'invitation'), isNull(tokensTable.userId)))
    .groupBy(tokensTable[targetEntityIdField])
    .as('invites');

  return db
    .select({
      id: entityIdColumn,
      admin: count(sql`CASE WHEN ${membershipsTable.activatedAt} IS NOT NULL AND ${membershipsTable.role} = 'admin' THEN 1 END`).as('admin'),
      member: count(sql`CASE WHEN ${membershipsTable.activatedAt} IS NOT NULL AND ${membershipsTable.role} = 'member' THEN 1 END`).as('member'),
      pending:
        sql<number>`CAST(${count(sql`CASE WHEN ${membershipsTable.activatedAt} IS NULL THEN 1 END`)} + COALESCE(${inviteCountSubquery.invites}, 0) AS INTEGER)`.as(
          'pending',
        ),

      total: count().as('total'), // Fixed alias to avoid confusion
    })
    .from(membershipsTable)
    .leftJoin(inviteCountSubquery, eq(entityIdColumn, inviteCountSubquery.id))
    .where(and(eq(membershipsTable.contextType, entityType), isNotNull(membershipsTable.activatedAt)))
    .groupBy(entityIdColumn, inviteCountSubquery.invites)
    .as('membership_counts');
};

/**
 * Executes a count query to count admins and members for a given entity or entity id.
 *
 * @param entityType - The entity to filter by, or null for all entities.
 * @param id - id to filter the count by a specific entity instance.
 * @returns - The count of admins, members, pending and total members.
 */
export function getMemberCounts(entityType: ContextEntityType, id: string) {
  const query = getMemberCountsQuery(entityType);

  return db
    .select({
      admin: query.admin,
      member: query.member,
      pending: query.pending,
      total: query.total,
    })
    .from(query)
    .where(eq(query.id, id))
    .then((rows) => rows[0] || { admin: 0, member: 0, pending: 0, total: 0 });
}

/**
 * Counts related entities (Context + Product) for the given entity instance
 * by running one query per entity type instead of a single multi‑join.
 *
 * @param entity          – Base entity type whose ID we’re counting against
 * @param entityId        – ID value of that base entity
 * @param countConditions – Optional extra WHERE fragments per entity type
 *
 * @returns Record mapping each valid entity type to its count
 */
export const getRelatedEntityCounts = async (
  entityType: ContextEntityType,
  entityId: string,
  countConditions: Partial<Record<ProductEntityType | ContextEntityType, SQL>> = {},
) => {
  const entityIdField = appConfig.entityIdFields[entityType];

  // Only keep entity types that actually contain the ID field we care about
  const validEntities = getRelatedEntities(entityType);
  if (!validEntities.length) return {} as Record<ValidEntities<typeof entityIdField>, number>;

  // Run one COUNT query per entity type in parallel
  const counts = await Promise.all(
    validEntities.map(async (entityType) => {
      const table = entityTables[entityType];
      const idColumn = table[entityIdField as keyof typeof table] as SQLWrapper;
      const extraCondition = countConditions[entityType];

      const [row] = await db
        .select({ count: count().as('count') })
        .from(table)
        .where(extraCondition ? and(eq(idColumn, entityId), extraCondition) : eq(idColumn, entityId));

      return [entityType, row?.count ?? 0] as const;
    }),
  );

  // Convert array of tuples → Record<'entityType', number>
  return Object.fromEntries(counts) as Record<ValidEntities<typeof entityIdField>, number>;
};

export const getRelatedEntityCountsQuery = (entityType: ContextEntityType) => {
  const entityIdField = appConfig.entityIdFields[entityType];
  const table = entityTables[entityType];
  if (!table) throw new Error(`Invalid entityType: ${entityType}`);

  const entityIdColumn = table.id; // the target table must match the context — adapt as needed

  // Only keep entity types that actually contain the ID field we care about
  const validEntities = getRelatedEntities(entityType);
  if (!validEntities.length) return db.select({ id: entityIdColumn }).from(table).where(sql`false`).as('related_counts'); // returns zero rows

  const baseCounts: Record<string, SQL.Aliased<number>> = {};
  const joins: {
    subquery: SubqueryWithSelection<
      {
        [x: string]: never;
      },
      string
    >;
    alias: string;
    join: SQL;
  }[] = [];

  for (const relatedEntityType of validEntities) {
    const relatedTable = entityTables[relatedEntityType];
    if (!relatedTable || !(entityIdField in relatedTable)) continue;
    const alias = `${relatedEntityType}_counts`;
    const fkColumn = relatedTable[entityIdField as keyof typeof relatedTable] as PgColumn;

    const subquery = db
      .select<SelectedFields<PgColumn, typeof relatedTable>>({
        [entityIdField]: fkColumn,
        [relatedEntityType]: count().as(relatedEntityType),
      })
      .from(relatedTable)
      .groupBy(fkColumn)
      .as(alias);

    joins.push({ subquery, alias, join: eq(entityIdColumn, subquery[entityIdField]) });

    baseCounts[relatedEntityType] = sql<number>`COALESCE(${sql.raw(`"${alias}"."${relatedEntityType}"`)}, 0)`.as(relatedEntityType);
  }

  const query = db.select({ id: entityIdColumn, ...baseCounts }).from(organizationsTable);

  for (const { subquery, join } of joins) query.leftJoin(subquery, join);

  return query.as('related_counts');
};
