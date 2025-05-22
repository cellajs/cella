import { type ContextEntityType, type ProductEntityType, config } from 'config';
import { type SQL, type SQLWrapper, and, count, eq, isNull, sql } from 'drizzle-orm';
import { db } from '#/db/db';
import { membershipsTable } from '#/db/schema/memberships';
import { tokensTable } from '#/db/schema/tokens';
import { entityTables } from '#/entity-config';

type EntityIdColumnNames = keyof (typeof membershipsTable)['_']['columns'];

/**
 * Generates a query to count the number of admins and members for a specific entity.
 * If an entity is provided, counts are filtered by entity. Otherwise, counts are for all entities.
 *
 * @param entity - The entity type to filter by, or null for counting all entities.
 *
 * @returns Query object that can be executed
 */
export const getMemberCountsQuery = (entityType: ContextEntityType) => {
  const targetEntityIdField = config.entityIdFields[entityType];
  const entityIdColumn = membershipsTable[targetEntityIdField as EntityIdColumnNames];
  if (!entityIdColumn) throw new Error(`Entity ${entityType} does not have an ID column defined`);

  // Subquery to count pending invitations
  const inviteCountSubquery = db
    .select({
      id: tokensTable[targetEntityIdField],
      invites: count().as('invites'),
    })
    .from(tokensTable)
    .where(and(eq(tokensTable.entityType, entityType), eq(tokensTable.type, 'invitation'), isNull(tokensTable.userId)))
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
    .where(eq(membershipsTable.contextType, entityType))
    .groupBy(entityIdColumn, inviteCountSubquery.invites)
    .as('counts');
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
  const entityIdField = config.entityIdFields[entityType];

  const allEntities = [...config.productEntityTypes, ...config.contextEntityTypes];

  // Only keep entity types that actually contain the ID field we care about
  const validEntities = allEntities.filter((t) => hasField(t, entityIdField));
  if (!validEntities.length) {
    return {} as Record<ValidEntities<typeof entityIdField>, number>;
  }

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

// Define a mapped type to check if field name passed as 'T' exists in each table and filter out 'never' types
export type ValidEntities<T extends string> = Extract<
  {
    [K in ProductEntityType | ContextEntityType]: T extends keyof (typeof entityTables)[K] ? K : never;
  }[ProductEntityType | ContextEntityType],
  string
>;

// Generic type guard function for filtering based on a dynamic field name 'T'
const hasField = <T extends string>(entityType: ProductEntityType | ContextEntityType, field: T): entityType is ValidEntities<T> => {
  const table = entityTables[entityType];
  return field in table;
};
