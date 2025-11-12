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
interface InsertMultipleProps<T> {
  userId: string;
  role: MembershipModel['role'];
  entity: T;
  createdBy: string;
}

/**
 * Returns an object mapping base membership entity IDs for the given entity.
 *
 * Each mapping corresponds to a context entity type defined in `appConfig.contextEntityTypes`.
 * The key of each mapping is derived from the values of `appConfig.entityIdFields`
 * (e.g. `"organizationId"`, `"projectId"`), and the value is the corresponding string ID.
 *
 *
 * @template T - The specific context entity type.
 * @param entity - The entity object to extract membership ID information from.
 * @returns An object mapping base membership entity IDs for the given entity.
 */
export const getBaseMembershipEntityId = <T extends ContextEntityType>(entity: EntityModel<T>) => {
  return appConfig.contextEntityTypes.reduce(
    (acc, contextEntityType) => {
      const entityFieldIdName = appConfig.entityIdFields[contextEntityType];
      if (!entityFieldIdName) return acc;

      if (entity.entityType === contextEntityType) {
        acc[entityFieldIdName] = entity.id;
      }
      if (entityFieldIdName in entity) {
        acc[entityFieldIdName] = entity[entityFieldIdName as keyof typeof entity] as string;
      }

      return acc;
    },
    {} as Partial<Record<(typeof appConfig.entityIdFields)[keyof typeof appConfig.entityIdFields], string>> & { organizationId: string },
  );
};

/**
 * Batch insert direct memberships for existing users.
 *
 * - Ensures organization membership exists for non-organization entities.
 * - Ensures associated parent membership exists when applicable.
 * - Inserts the target entity memberships.
 * - Computes per-user 'order' in a single grouped query and increments by 10.
 *
 * @param items - membership requests for existing users
 * @returns inserted target memberships (MembershipBaseModel)
 */
export const insertMemberships = async <T extends BaseEntityModel>(items: Array<InsertMultipleProps<T>>): Promise<Array<MembershipBaseModel>> => {
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

    // Get organizationId: prefer entity.organizationId if present, else entity.id (organization)
    const targetEntitiesIdFields = getBaseMembershipEntityId(entity);

    // Compute incremental order per user: start from global max, then +10 per assignment
    const prevMax = maxOrdersByUser.get(userId) ?? 0;
    const alreadyAssigned = assignedCounts.get(userId) ?? 0;
    const nextOrder = (prevMax ? prevMax : 0) + (alreadyAssigned === 0 ? 1000 - prevMax : 0) + alreadyAssigned * 10 || 1000;
    assignedCounts.set(userId, alreadyAssigned + 1);

    // Build base row used in all inserts for this item
    const baseMembership = {
      userId,
      role,
      createdBy,
      order: nextOrder,
    } as const;

    return { targetEntitiesIdFields, baseMembership, entity };
  });

  // Build organization membership rows (only for non-organization entities)
  const orgRows = prepared
    .filter(({ entity }) => entity.entityType !== 'organization')
    .map(({ baseMembership, targetEntitiesIdFields }) => {
      // Extract only organizationId (ignore other entity IDs)
      const { organizationId } = targetEntitiesIdFields;
      return {
        ...baseMembership,
        organizationId,
        contextType: 'organization',
      } satisfies InsertMembershipModel;
    });

  // Build associated entity membership rows (when an associated relationship exists)
  const associatedRows = prepared
    .map(({ baseMembership, targetEntitiesIdFields, entity }) => {
      // Find a associated relationship for this entity type
      const relation = appConfig.menuStructure.find((rel) => rel.subentityType === entity.entityType);
      if (!relation) return null;

      //  Get associated entity type and corresponding ID field name
      const associatedType = relation.entityType;
      if (!associatedType) return null;

      // TODO(DAVID)(REFACTOR) fix assign entities fields for associated entities(also change menu structure?)
      return {
        ...baseMembership,
        ...targetEntitiesIdFields,
        contextType: associatedType,
      } satisfies InsertMembershipModel;
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  // Build target entity membership rows (the ones we return after insert)
  const targetRows: InsertMembershipModel[] = prepared.map(({ baseMembership, targetEntitiesIdFields, entity }) => ({
    ...baseMembership,
    contextType: entity.entityType,
    ...targetEntitiesIdFields,
  }));

  const [insertedTarget] = await Promise.all([
    // targetRows → main insert (returns inserted memberships)
    db
      .insert(membershipsTable)
      .values(targetRows)
      .returning(membershipBaseSelect),

    // optional org + associated inserts (safe upserts)
    orgRows.length ? db.insert(membershipsTable).values(orgRows).onConflictDoNothing() : Promise.resolve(),
    associatedRows.length ? db.insert(membershipsTable).values(associatedRows).onConflictDoNothing() : Promise.resolve(),
  ]);

  // Emit a log for each inserted membership (keeps your original semantics)
  for (const row of insertedTarget) {
    const entityType = row.contextType;
    const entityIdField = appConfig.entityIdFields[entityType];
    const entityId = row[entityIdField];
    logEvent('info', `User added to ${entityType}`, { userId: row.userId, [entityIdField]: entityId });
  }

  // Return inserted target rows to the caller
  return insertedTarget;
};
