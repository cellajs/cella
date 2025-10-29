import { appConfig, type ContextEntityType } from 'config';
import { inArray, max } from 'drizzle-orm';
import { db } from '#/db/db';
import { InsertMembershipModel, type MembershipModel, membershipsTable } from '#/db/schema/memberships';
import type { EntityModel } from '#/lib/entity';
import { MembershipBaseModel, membershipBaseSelect } from '#/modules/memberships/helpers/select';
import { logEvent } from '#/utils/logger';

type BaseEntityModel = EntityModel<ContextEntityType> & {
  organizationId?: string;
};

/**
 * Helpers to find associated entity details for a given entity.
 * @param entity - entity to find associated entities for
 * @returns
 */
export const getAssociatedEntityDetails = <T extends ContextEntityType>(entity: EntityModel<T>) => {
  // Find a parent/associated relationship for the entity's type
  const relation = appConfig.menuStructure.find((rel) => rel.subentityType === entity.entityType);
  if (!relation) return null;

  // Resolve parent type and its id field
  const type = relation.entityType;
  const field = appConfig.entityIdFields[type] ?? null;
  if (!field || !(field in entity)) return null;

  // Read the associated entity id from the current entity
  const id = entity[field as keyof typeof entity] as string;
  return { id, type, field };
};

interface Props<T> {
  userId: string;
  role: MembershipModel['role'];
  entity: T;
  createdBy?: string;
}

/**
 * Batch insert memberships for existing users.
 *
 * - Ensures organization membership exists for non-organization entities.
 * - Ensures associated parent membership exists when applicable.
 * - Inserts the target entity membership
 * - Computes per-user 'order' in a single grouped query and increments by 10.
 *
 * @param items - membership requests for existing users
 * @returns inserted target memberships (MembershipBaseModel)
 */
export const insertMemberships = async <T extends BaseEntityModel>(items: Array<Props<T>>): Promise<Array<MembershipBaseModel>> => {
  // Early exit: nothing to insert
  if (!items.length) return [];

  // Collect the distinct userIds appearing in this batch (for order calc)
  const userIds = Array.from(new Set(items.map((i) => i.userId)));

  // Fetch per-user max(order) in one query to determine the next order baseline
  const maxOrderRows =
    userIds.length > 0
      ? await db
        .select({
          userId: membershipsTable.userId,
          maxOrder: max(membershipsTable.order),
        })
        .from(membershipsTable)
        .where(inArray(membershipsTable.userId, userIds))
        .groupBy(membershipsTable.userId)
      : [];

  // Map userId -> current max(order) (default 0 if none)
  const maxOrdersByUser = new Map<string, number>(maxOrderRows.map((r) => [r.userId, r.maxOrder ?? 0]));

  // Track how many rows we've assigned per user in this run (to increment order by +10 each time)
  const assignedCounts = new Map<string, number>();

  // Precompute per-item resolved details (entity fields, associated relation, base row)
  const prepared = items.map((info) => {
    // Resolve defaults and contextual fields
    const { userId, role, entity } = info;
    const createdBy = info.createdBy ?? userId;
    const entityIdField = appConfig.entityIdFields[entity.entityType];
    const associatedEntity = getAssociatedEntityDetails(entity);

    // Get organizationId: prefer entity.organizationId if present, else entity.id (organization)
    const organizationId = entity.organizationId ?? entity.id;

    // Compute incremental order per user: start from global max, then +10 per assignment
    const prevMax = maxOrdersByUser.get(userId) ?? 0;
    const alreadyAssigned = assignedCounts.get(userId) ?? 0;
    const nextOrder = (prevMax ? prevMax : 0) + (alreadyAssigned === 0 ? 1000 - prevMax : 0) + alreadyAssigned * 10 || 1000;
    assignedCounts.set(userId, alreadyAssigned + 1);

    // Build base row used in all inserts for this item
    const base = {
      organizationId,
      userId,
      role,
      createdBy,
      order: nextOrder,
    };

    return { info, entityIdField, associatedEntity, base };
  });

  // Build organization membership rows (only for non-organization entities)
  const orgRows: InsertMembershipModel[] = prepared
    .filter(({ info }) => info.entity.entityType !== 'organization')
    .map(({ base }) => ({ ...base, contextType: 'organization' }));

  // Build associated entity membership rows (when an associated relationship exists)
  const associatedRows: InsertMembershipModel[] = prepared
    .filter(({ associatedEntity }) => !!associatedEntity)
    .map(({ base, associatedEntity }) => ({
      ...base,
      contextType: associatedEntity!.type,
      [associatedEntity!.field]: associatedEntity!.id,
    }));

  // Build target entity membership rows (the ones we return after insert)
  const targetRows: InsertMembershipModel[] = prepared.map(({ base, info, entityIdField, associatedEntity }) => ({
    ...base,
    contextType: info.entity.entityType,
    ...(info.entity.entityType !== 'organization' && { [entityIdField]: info.entity.id }),
    ...(associatedEntity && { [associatedEntity.field]: associatedEntity.id }),
  }));

  // Upsert org memberships first (safe if none or duplicates)
  if (orgRows.length) {
    await db.insert(membershipsTable).values(orgRows).onConflictDoNothing();
  }

  // Upsert associated memberships second (safe if none or duplicates)
  if (associatedRows.length) {
    await db.insert(membershipsTable).values(associatedRows).onConflictDoNothing();
  }

  // Insert target memberships and return their selected fields
  const inserted = await db.insert(membershipsTable).values(targetRows).returning(membershipBaseSelect);

  // Emit a log for each inserted membership (keeps your original semantics)
  for (const row of inserted) {
    const entityType = row.contextType;
    const entityIdField = appConfig.entityIdFields[entityType];
    const entityId = row[entityIdField];
    logEvent('info', `User added to ${entityType}`, { userId: row.userId, [entityIdField]: entityId });
  }

  // Return inserted target rows to the caller
  return inserted;
};