import { inArray, max } from 'drizzle-orm';
import { appConfig, type ContextEntityType, hierarchy } from 'shared';
import type { DbOrTx } from '#/db/db';
import { InsertMembershipModel, type MembershipModel, membershipsTable } from '#/db/schema/memberships';
import type { EntityModel } from '#/lib/resolve-entity';

import { MembershipBaseModel, membershipBaseSelect } from '#/modules/memberships/helpers/select';
import { logEvent } from '#/utils/logger';

/**
 * The root context entity type — the parentless context entity (e.g. 'organization').
 * Derived from the hierarchy so forks that change the root entity type
 * don't need to update membership helper code.
 */
const rootContextType = hierarchy.contextTypes.find((t) => hierarchy.getParent(t) === null)!;
const rootIdColumnKey = appConfig.entityIdColumnKeys[rootContextType];

type BaseEntityModel = EntityModel<ContextEntityType> & {
  [key: string]: unknown;
  tenantId: string; // Required for RLS
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
 * The key of each mapping is derived from the values of `appConfig.entityIdColumnKeys`
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
      const entityFieldIdName = appConfig.entityIdColumnKeys[contextEntityType];
      if (!entityFieldIdName) return acc;

      if (entity.entityType === contextEntityType) {
        acc[entityFieldIdName] = entity.id;
      }
      if (entityFieldIdName in entity) {
        acc[entityFieldIdName] = entity[entityFieldIdName as keyof typeof entity] as string;
      }

      return acc;
    },
    {} as Record<(typeof appConfig.entityIdColumnKeys)[ContextEntityType], string>,
  );
};

/**
 * Batch insert direct memberships for existing users. The function assumes that
 *  the data is already deduped, normalized and valid.
 *
 * - Ensures organization membership exists for non-organization entities.
 *   (relies on DB unique constraints + onConflictDoNothing to only insert when missing)
 * - Ensures associated parent membership exists when applicable.
 *   (same: only inserted when missing)
 * - Inserts the target entity memberships.
 * - Computes per-user 'order' in a single grouped query and increments by 10.
 *
 * @param items - membership requests for existing users
 * @returns inserted target memberships (MembershipBaseModel)
 */
export const insertMemberships = async <T extends BaseEntityModel>(
  db: DbOrTx,
  items: Array<InsertMultipleProps<T>>,
): Promise<Array<MembershipBaseModel>> => {
  // Early exit: nothing to insert
  if (!items.length) return [];

  // Collect the distinct userIds appearing in this batch (for order calc)
  const userIds = Array.from(new Set(items.map((i) => i.userId)));

  // Fetch per-user max(displayOrder) in one query to determine the next displayOrder baseline
  const maxOrderRows = await db
    .select({ userId: membershipsTable.userId, maxOrder: max(membershipsTable.displayOrder) })
    .from(membershipsTable)
    .where(inArray(membershipsTable.userId, userIds))
    .groupBy(membershipsTable.userId);

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
    const targetEntitiesIdColumnKeys = getBaseMembershipEntityId(entity);

    // Compute incremental order per user: start from global max, then +10 per assignment
    const prevMax = maxOrdersByUser.get(userId) ?? 0;
    const alreadyAssigned = assignedCounts.get(userId) ?? 0;
    const base = prevMax === 0 ? 990 : prevMax;
    const nextOrder = base + (alreadyAssigned + 1) * 10;

    assignedCounts.set(userId, alreadyAssigned + 1);

    // Build base row used in all inserts for this item
    const baseMembership = {
      userId,
      role,
      createdBy,
      displayOrder: nextOrder,
    } as const;

    return { targetEntitiesIdColumnKeys, baseMembership, entity };
  });

  /**
   * Build root context membership rows (only for non-root entities).
   * These are parent memberships and always get role "member".
   * Creation is effectively "only if not existing" thanks to unique constraint + onConflictDoNothing.
   */
  const rootRows: InsertMembershipModel[] = prepared
    .filter(({ entity }) => entity.entityType !== rootContextType)
    .map(({ baseMembership, targetEntitiesIdColumnKeys, entity }) => {
      return {
        ...baseMembership,
        tenantId: entity.tenantId,
        role: 'member', // parent membership is always 'member'
        [rootIdColumnKey]: targetEntitiesIdColumnKeys[rootIdColumnKey],
        contextType: rootContextType,
      } as InsertMembershipModel;
    });

  // Build associated entity membership rows (when an associated relationship exists)
  const associatedRows = prepared
    .map(({ baseMembership, targetEntitiesIdColumnKeys, entity }) => {
      // Find a associated relationship for this entity type
      const relation = appConfig.menuStructure.find((rel) => rel.subentityType === entity.entityType);
      if (!relation) return null;

      //  Get associated entity type and corresponding ID field name
      const associatedType = relation.entityType;
      if (!associatedType) return null;

      const associatedField = targetEntitiesIdColumnKeys[appConfig.entityIdColumnKeys[associatedType]];
      if (!associatedField) return null;

      // Get the target entity's ID field to exclude it, but always preserve the root context ID
      const targetEntityIdColumnKey = appConfig.entityIdColumnKeys[entity.entityType];
      const { [targetEntityIdColumnKey]: _, ...remainingIdColumnKeys } = targetEntitiesIdColumnKeys;

      return {
        ...baseMembership,
        tenantId: entity.tenantId,
        role: 'member', // parent/associated membership is always 'member'
        ...remainingIdColumnKeys,
        contextType: associatedType,
      } as InsertMembershipModel;
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  // Build target entity membership rows (the ones we return after insert)
  const targetRows: InsertMembershipModel[] = prepared.map(
    ({ baseMembership, targetEntitiesIdColumnKeys, entity }) => ({
      ...baseMembership,
      tenantId: entity.tenantId,
      contextType: entity.entityType,
      ...targetEntitiesIdColumnKeys,
    }),
  );

  const [insertedTarget] = await Promise.all([
    // targetRows → main insert (returns inserted memberships)
    db.insert(membershipsTable).values(targetRows).returning(membershipBaseSelect),

    // optional root context + associated inserts (safe upserts)
    rootRows.length ? db.insert(membershipsTable).values(rootRows).onConflictDoNothing() : Promise.resolve(),
    associatedRows.length
      ? db.insert(membershipsTable).values(associatedRows).onConflictDoNothing()
      : Promise.resolve(),
  ]);

  if (insertedTarget.length) {
    logEvent('info', `${insertedTarget.length} memberships have been created`);
  }

  return insertedTarget;
};
