import { type ContextEntity, type ProductEntity, config } from 'config';
import { type SQL, type SQLWrapper, count, eq, sql } from 'drizzle-orm';
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
      admin: count(sql`CASE WHEN ${membershipsTable.activatedAt} IS NOT NULL AND ${membershipsTable.role} = 'admin' THEN 1 END`).as('admin'),
      member: count(sql`CASE WHEN ${membershipsTable.activatedAt} IS NOT NULL AND ${membershipsTable.role} = 'member' THEN 1 END`).as('member'),
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
 * Retrieves count of related entities(Context and Product) for passed Context entity based on its ID.
 *
 * @param entity Entity type (Context or Product).
 * @param entityId ID of entity.
 * @param countConditions - Optional,  An object where the key is entities(Context and Product) and the value is the condition to apply.
 * @returns A record mapping each entity type to its corresponding count.
 *
 * @example
 * // Example usage for counting related entities with an additional condition for "attachment"
 * await getRelatedEntityCounts(
 *   'organization',
 *   organization.id,
 *   {
 *     attachment: sql`${attachmentsTable.name} = 'Screenshot'` // Applies condition to the "attachment" entity type
 *   }
 * );
 */
export const getRelatedEntityCounts = async (
  entity: ContextEntity,
  entityId: string,
  countConditions: Partial<Record<'organization' | 'attachment', SQL>> = {},
) => {
  // Get the ID field based on entity
  const entityIdField = entityIdFields[entity];

  const allEntityTypes = [...config.productEntityTypes, ...config.contextEntityTypes];

  // Filter valid entity types that have the specified entityIdField
  const validEntityTypes = allEntityTypes.filter((type) => hasField(type, entityIdField));
  if (!validEntityTypes.length) return {} as Record<ValidEntityTypes<typeof entityIdField>, number>;
  // Get the base table for the first valid entity type
  const firstTableTable = entityTables[validEntityTypes[0]];

  // Create count fields for each valid entity type, applying any custom conditions
  const countFields = validEntityTypes.reduce(
    (acc, entityType) => {
      const table = entityTables[entityType];
      const additionalCondition = countConditions[entityType];

      acc[entityType] = count(
        sql`DISTINCT CASE WHEN ${table[entityIdField as keyof typeof table]} = ${entityId} ${additionalCondition ? sql`AND ${additionalCondition}` : sql``} THEN ${table.id} ELSE NULL END`,
      ).as(entityType);
      return acc;
    },
    {} as Record<ValidEntityTypes<typeof entityIdField>, SQL.Aliased<number>>,
  );

  // Build the query to count related entities
  let query = db
    .select(countFields)
    .from(firstTableTable)
    .where(eq(firstTableTable[entityIdField as keyof typeof firstTableTable] as SQLWrapper, entityId));

  // Add LEFT JOINs for remaining valid entity types
  for (let i = 1; i < validEntityTypes.length; i++) {
    const table = entityTables[validEntityTypes[i]];
    const tableField = table[entityIdField as keyof typeof table] as SQLWrapper;
    query = query.leftJoin(table, eq(tableField, entityId));
  }

  // Execute query and return result or zero counts
  const result = await query;
  return result[0] || Object.fromEntries(validEntityTypes.map((type) => [type, 0]));
};

// Define a mapped type to check if field name passed as 'T' exists in each table and filter out 'never' types
export type ValidEntityTypes<T extends string> = Extract<
  {
    [K in ProductEntity | ContextEntity]: T extends keyof (typeof entityTables)[K] ? K : never;
  }[ProductEntity | ContextEntity],
  string
>;

// Generic type guard function for filtering based on a dynamic field name 'T'
const hasField = <T extends string>(entityType: ProductEntity | ContextEntity, field: T): entityType is ValidEntityTypes<T> => {
  const table = entityTables[entityType];
  return field in table;
};
