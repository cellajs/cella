import { db } from '#/db/db';
import { membershipsTable } from '#/db/schema/memberships';
import { entityTables } from '#/entity-config';
import { membershipSummarySelect } from '#/modules/memberships/helpers/select';
import { type ContextEntityType, config } from 'config';
import { and, asc, eq, isNotNull } from 'drizzle-orm';

// Get user menu items with membership info for a given entity type
export const getUserMenuEntities = async (entityType: ContextEntityType, userId: string) => {
  const table = entityTables[entityType];
  const entityIdField = config.entityIdFields[entityType];

  return await db
    .select({
      id: table.id,
      slug: table.slug,
      entityType: table.entityType,
      name: table.name,
      thumbnailUrl: table.thumbnailUrl,
      organizationId: membershipSummarySelect.organizationId,
      membership: membershipSummarySelect,
      createdAt: table.createdAt,
      modifiedAt: table.modifiedAt,
    })
    .from(table)
    .where(and(eq(membershipsTable.userId, userId), eq(membershipsTable.contextType, entityType)))
    .orderBy(asc(membershipsTable.order))
    .innerJoin(membershipsTable, and(eq(membershipsTable[entityIdField], table.id), isNotNull(membershipsTable.activatedAt)));
};
