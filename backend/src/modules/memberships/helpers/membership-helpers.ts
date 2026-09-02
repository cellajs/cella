import { inArray, max } from 'drizzle-orm';
import { appConfig, type ChannelEntityType, hierarchy } from 'shared';
import type { MenuStructureItem } from 'shared/config-builder';
import { defaultOrder, orderGap } from 'shared/utils/display-order';
import type { DbContext } from '#/core/context';
import { type MembershipBaseModel, membershipBaseSelect } from '#/modules/memberships/helpers/select';
import type { InsertMembershipModel, MembershipModel } from '#/modules/memberships/memberships-db';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import type { EntityModel } from '#/tables';
import { log } from '#/utils/logger';

const rootChannelType = hierarchy.rootChannelType;
const rootIdColumnKey = appConfig.entityIdColumnKeys[rootChannelType];

/**
 * Role for an auto-created associated membership (menuStructure): the invited role carries over
 * when `carryRole` is set and valid, else the target vocabulary's least-privileged (last) role.
 */
export const resolveAssociatedMembershipRole = (
  channelType: ChannelEntityType,
  invitedRole: MembershipModel['role'],
  carryRole = false,
): MembershipModel['role'] => {
  const channelRoles = hierarchy.getRoles(channelType) as readonly MembershipModel['role'][];
  if (carryRole && channelRoles.includes(invitedRole)) return invitedRole;
  return hierarchy.getLeastPrivilegedRole(channelType) as MembershipModel['role'];
};

/**
 * Role for the auto-created root context membership, from the source channel's `rootRoles` map.
 * No implicit fallback: a channel that auto-creates root rows must declare the complete map
 * (config-time validation makes a miss here a programming error, not a data-dependent one).
 */
export const resolveRootMembershipRole = (
  sourceChannelType: ChannelEntityType,
  invitedRole: MembershipModel['role'],
): MembershipModel['role'] => {
  const explicit = hierarchy.getRootRole(sourceChannelType, invitedRole) as MembershipModel['role'] | undefined;
  if (explicit === undefined) {
    throw new Error(
      `insertMemberships: channel "${sourceChannelType}" declares no rootRoles mapping for role "${invitedRole}"; ` +
        'explicit escalation is required to auto-create the root membership row.',
    );
  }
  return explicit;
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

/** Maps a channel entity to its ancestor channel IDs, keyed by `appConfig.entityIdColumnKeys`. */
export const getMembershipEntityIds = <T extends ChannelEntityType>(entity: EntityModel<T>) => {
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
 * Batch-inserts direct memberships for existing users; `items` must already be deduped, normalized and valid.
 * Root and associated parent memberships are upserted (unique constraint plus onConflictDoNothing), per-user `displayOrder`
 * comes from one grouped query spaced by `orderGap`, and the inserted target memberships are returned.
 */
export const insertMemberships = async <T extends BaseEntityModel>(
  ctx: DbContext,
  { items }: { items: Array<InsertMultipleProps<T>> },
): Promise<Array<MembershipBaseModel>> => {
  const { db } = ctx.var;
  if (!items.length) return [];

  const userIds = Array.from(new Set(items.map((i) => i.userId)));

  // One query for per-user max(displayOrder), the baseline for the next order
  const maxOrderRows = await db
    .select({ userId: membershipsTable.userId, maxOrder: max(membershipsTable.displayOrder) })
    .from(membershipsTable)
    .where(inArray(membershipsTable.userId, userIds))
    .groupBy(membershipsTable.userId);

  const maxOrdersByUser = new Map<string, number>(maxOrderRows.map((r) => [r.userId, r.maxOrder ?? 0]));

  // Rows assigned per user in this run, to step the order by orderGap
  const assignedCounts = new Map<string, number>();

  const prepared = items.map((info) => {
    const { userId, role, entity } = info;
    const createdBy = info.createdBy ?? userId;

    const targetEntitiesIdColumnKeys = getMembershipEntityIds(entity);

    // Order per user: start at the global max and add orderGap per assignment, seeded so a first assignment lands on `defaultOrder`.
    const prevMax = maxOrdersByUser.get(userId) ?? 0;
    const alreadyAssigned = assignedCounts.get(userId) ?? 0;
    const base = prevMax === 0 ? defaultOrder - orderGap : prevMax;
    const nextOrder = base + (alreadyAssigned + 1) * orderGap;

    assignedCounts.set(userId, alreadyAssigned + 1);

    const baseMembership = {
      userId,
      role,
      createdBy,
      displayOrder: nextOrder,
    } as const;

    return { targetEntitiesIdColumnKeys, baseMembership, entity, extraFields: info.extraFields };
  });

  // Root context membership rows for non-root entities; unique constraint plus onConflictDoNothing makes this insert-if-missing.
  const rootRows: InsertMembershipModel[] = prepared
    .filter(({ entity }) => entity.entityType !== rootChannelType)
    .map(({ baseMembership, targetEntitiesIdColumnKeys, entity }) => {
      return {
        ...baseMembership,
        tenantId: entity.tenantId,
        // Explicit escalation via the source channel rootRoles map; a missing map throws
        role: resolveRootMembershipRole(entity.entityType as ChannelEntityType, baseMembership.role),
        [rootIdColumnKey]: targetEntitiesIdColumnKeys[rootIdColumnKey],
        channelType: rootChannelType,
        channelId: targetEntitiesIdColumnKeys[rootIdColumnKey],
      } as InsertMembershipModel;
    });

  const associatedRows = prepared
    .map(({ baseMembership, targetEntitiesIdColumnKeys, entity }) => {
      const relation = appConfig.menuStructure.find((rel) => rel.subentityType === entity.entityType);
      if (!relation) return null;

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
        role: resolveAssociatedMembershipRole(
          associatedType as ChannelEntityType,
          baseMembership.role,
          // Config literals only carry the property when an app sets it
          'carryRole' in relation ? (relation as MenuStructureItem).carryRole : undefined,
        ),
        ...remainingIdColumnKeys,
        channelType: associatedType,
        channelId: associatedField,
      } as InsertMembershipModel;
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

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
    db.insert(membershipsTable).values(targetRows).returning(membershipBaseSelect),

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
