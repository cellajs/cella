import { inArray, max } from 'drizzle-orm';
import { appConfig, type ChannelEntityType, hierarchy } from 'shared';
import type { MenuStructureItem } from 'shared/config-builder';
import { defaultOrder, orderGap } from 'shared/utils/display-order';
import type { DbContext } from '#/core/context';
import type { EntityModel } from '#/modules/entities/entities-queries';
import { type MembershipBaseModel, membershipBaseSelect } from '#/modules/memberships/helpers/select';
import {
  type InsertMembershipModel,
  type MembershipModel,
  membershipsTable,
} from '#/modules/memberships/memberships-db';
import { log } from '#/utils/logger';

/**
 * The root channel entity type: the parentless channel entity (e.g. 'organization').
 * Derived from the hierarchy so forks that change the root entity type
 * don't need to update membership helper code.
 */
const rootChannelType = hierarchy.channelTypes.find((t) => hierarchy.getParent(t) === null)!;
const rootIdColumnKey = appConfig.entityIdColumnKeys[rootChannelType];

/**
 * Role for an auto-created parent/associated membership. Defaults to the least-privileged
 * fitting role: `member` when the target vocabulary has it, else the vocabulary's last role
 * (roles are declared most → least privileged). With `carryRole` (menuStructure), the invited
 * role carries over when valid in the target vocabulary.
 */
export const resolveParentMembershipRole = (
  channelType: ChannelEntityType,
  invitedRole: MembershipModel['role'],
  carryRole = false,
): MembershipModel['role'] => {
  const channelRoles = hierarchy.getRoles(channelType) as readonly MembershipModel['role'][];
  if (carryRole && channelRoles.includes(invitedRole)) return invitedRole;
  if (channelRoles.includes('member' as MembershipModel['role'])) return 'member' as MembershipModel['role'];
  return channelRoles[channelRoles.length - 1];
};

type BaseEntityModel = EntityModel<ChannelEntityType> & {
  [key: string]: unknown;
  tenantId: string; // Required for RLS
};

interface InsertMultipleProps<T> {
  userId: string;
  role: MembershipModel['role'];
  entity: T;
  createdBy: string;
  /** Extra columns to set on the target membership row (e.g. workspaceId). */
  extraFields?: Partial<InsertMembershipModel>;
}

/**
 * Returns an object mapping base membership entity IDs for the given entity.
 *
 * Each mapping corresponds to a channel entity type defined in `appConfig.channelEntityTypes`.
 * The key of each mapping is derived from the values of `appConfig.entityIdColumnKeys`
 * (e.g. `"organizationId"`, `"projectId"`), and the value is the corresponding string ID.
 *
 *
 * @template T - The specific channel entity type.
 * @param entity - The entity object to extract membership ID information from.
 * @returns An object mapping base membership entity IDs for the given entity.
 */
export const getBaseMembershipEntityId = <T extends ChannelEntityType>(entity: EntityModel<T>) => {
  return appConfig.channelEntityTypes.reduce(
    (acc, channelEntityType) => {
      const entityFieldIdName = appConfig.entityIdColumnKeys[channelEntityType];
      if (!entityFieldIdName) return acc;

      if (entity.entityType === channelEntityType) {
        acc[entityFieldIdName] = entity.id;
      }
      if (entityFieldIdName in entity) {
        acc[entityFieldIdName] = entity[entityFieldIdName as keyof typeof entity] as string;
      }

      return acc;
    },
    {} as Record<(typeof appConfig.entityIdColumnKeys)[ChannelEntityType], string>,
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
  ctx: DbContext,
  { items }: { items: Array<InsertMultipleProps<T>> },
): Promise<Array<MembershipBaseModel>> => {
  const { db } = ctx.var;
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

    // Compute incremental order per user: start from global max, then +orderGap per assignment.
    // For users with no existing memberships, seed so the first assignment lands on `defaultOrder`.
    const prevMax = maxOrdersByUser.get(userId) ?? 0;
    const alreadyAssigned = assignedCounts.get(userId) ?? 0;
    const base = prevMax === 0 ? defaultOrder - orderGap : prevMax;
    const nextOrder = base + (alreadyAssigned + 1) * orderGap;

    assignedCounts.set(userId, alreadyAssigned + 1);

    // Build base row used in all inserts for this item
    const baseMembership = {
      userId,
      role,
      createdBy,
      displayOrder: nextOrder,
    } as const;

    return { targetEntitiesIdColumnKeys, baseMembership, entity, extraFields: info.extraFields };
  });

  /**
   * Build root context membership rows (only for non-root entities).
   * These are parent memberships and always get role "member".
   * Creation is effectively "only if not existing" thanks to unique constraint + onConflictDoNothing.
   */
  const rootRows: InsertMembershipModel[] = prepared
    .filter(({ entity }) => entity.entityType !== rootChannelType)
    .map(({ baseMembership, targetEntitiesIdColumnKeys, entity }) => {
      return {
        ...baseMembership,
        tenantId: entity.tenantId,
        // parent membership defaults to the least-privileged fitting role ('member' in cella)
        role: resolveParentMembershipRole(rootChannelType, baseMembership.role),
        [rootIdColumnKey]: targetEntitiesIdColumnKeys[rootIdColumnKey],
        channelType: rootChannelType,
        channelId: targetEntitiesIdColumnKeys[rootIdColumnKey],
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
        // associated membership role: least-privileged fit, or carried over when carryRole is set
        role: resolveParentMembershipRole(
          associatedType as ChannelEntityType,
          baseMembership.role,
          // Config literals only carry the property when a fork sets it
          'carryRole' in relation ? (relation as MenuStructureItem).carryRole : undefined,
        ),
        ...remainingIdColumnKeys,
        channelType: associatedType,
        channelId: associatedField,
      } as InsertMembershipModel;
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  // Build target entity membership rows (the ones we return after insert)
  const targetRows: InsertMembershipModel[] = prepared.map(
    ({ baseMembership, targetEntitiesIdColumnKeys, entity, extraFields }) => ({
      ...baseMembership,
      tenantId: entity.tenantId,
      channelType: entity.entityType,
      channelId: entity.id,
      ...targetEntitiesIdColumnKeys,
      ...extraFields,
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
    log.info('Memberships created', { count: insertedTarget.length });
  }

  return insertedTarget;
};
