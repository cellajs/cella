import { type ContextEntity, type ProductEntity, config } from 'config';
import { type SQL, count, eq, sql } from 'drizzle-orm';
import { db } from '#/db/db';
import { membershipsTable } from '#/db/schema/memberships';
import { entityIdFields, entityTables } from '#/entity-config';

type EntityIdColumnNames = keyof (typeof membershipsTable)['_']['columns'];

/**
 * Generates a query to count the number of admins and members for a specific entity.
 * If an entity is provided, counts are filtered by entity. Otherwise, counts are for all entities.
 *
 * @param entity - The entity type to filter by, or null for counting all entities.
 *
 * @returns Query object that can be executed
 */
export const getMemberCountsQuery = (entity: ContextEntity) => {
  const entityIdColumn = membershipsTable[entityIdFields[entity] as EntityIdColumnNames];
  if (!entityIdColumn) throw new Error(`Entity ${entity} does not have an ID column defined`);

  return db
    .select({
      id: entityIdColumn,
      admins: count(sql`CASE WHEN ${membershipsTable.activatedAt} IS NOT NULL AND ${membershipsTable.role} = 'admin' THEN 1 END`).as('admins'),
      members: count(sql`CASE WHEN ${membershipsTable.activatedAt} IS NOT NULL AND ${membershipsTable.role} = 'member' THEN 1 END`).as('members'),
      pending: count(sql`CASE WHEN ${membershipsTable.activatedAt} IS NULL THEN 1 END`).as('pending'),
      total: count().as('total'), // Fixed alias to avoid confusion
    })
    .from(membershipsTable)
    .where(eq(membershipsTable.type, entity))
    .groupBy(entityIdColumn)
    .as('counts');
};

/**
 * Executes a count query to count admins and members for a given entity or entity id.
 *
 * @param entity - The entity to filter by, or null for all entities.
 * @param id - id to filter the count by a specific entity instance.
 * @returns - The count of admins, members, pending and total members.
 */
export function getMemberCounts(entity: ContextEntity, id: string) {
  const query = getMemberCountsQuery(entity);

  return db
    .select({
      admins: query.admins,
      members: query.members,
      pending: query.pending,
      total: query.total,
    })
    .from(query)
    .where(eq(query.id, id))
    .then((rows) => rows[0] || { admins: 0, members: 0, pending: 0, total: 0 });
}

/**
 * Retrieves the count of related entities(Context and Product) for organization based on its ID.
 *
 * @param organizationId The unique ID of the entity whose related entity counts are being fetched.
 * @returns An object mapping each entity type to its corresponding count value.
 */
export const getOrganizationCounts = async (organizationId: string) => {
  const allEntityTypes = [...config.productEntityTypes, ...config.contextEntityTypes];

  // Filter out entity types that do not have an 'organizationId'
  const validEntityTypes = allEntityTypes.filter(hasOrganizationId);
  const firstTableTable = entityTables[validEntityTypes[0]];

  // Each field will be an alias of the computed count, based on organizationId
  const countFields = validEntityTypes.reduce(
    (acc, entityType) => {
      const table = entityTables[entityType];
      // Count rows where organizationId matches, and alias it by entity type name
      acc[entityType] = count(sql`CASE WHEN ${table.organizationId} = ${organizationId} THEN 1 END`).as(entityType);
      return acc;
    },
    {} as Record<ValidEntityTypes, SQL.Aliased<number>>,
  );

  // Start the query by selecting the count fields from the base table
  let query = db.select(countFields).from(firstTableTable).where(eq(firstTableTable.organizationId, organizationId));

  // add a LEFT JOIN on the corresponding table
  for (let i = 1; i < validEntityTypes.length; i++) {
    const entityType = validEntityTypes[i];
    const table = entityTables[entityType];
    // Join on table for current entity
    query = query.leftJoin(table, eq(table.organizationId, organizationId));
  }

  const result = await query;

  // return result, or a default object with counts set to 0
  return result[0] || Object.fromEntries(validEntityTypes.map((type) => [type, 0]));
};

// Define a mapped type to check if 'organizationId' exists in each table
type EntityWithTargetId = {
  [K in ProductEntity | ContextEntity]: 'organizationId' extends keyof (typeof entityTables)[K] ? K : never;
};

// This will filter out 'never' types and give us only valid types
type ValidEntityTypes = Extract<EntityWithTargetId[ProductEntity | ContextEntity], string>;

// Define the type guard function for filtering
const hasOrganizationId = (entityType: ProductEntity | ContextEntity): entityType is ValidEntityTypes => {
  return 'organizationId' in entityTables[entityType];
};
