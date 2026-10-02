import type { ChannelEntityType } from 'shared';
import { appConfig } from 'shared';
import type { MenuStructureItem } from 'shared/config-builder/types';
import { defaultOrder, orderGap } from 'shared/utils/display-order';
import type { DbContext } from '#/core/context';
import {
  getMembershipEntityIds,
  resolveAssociatedMembershipRole,
  resolveOrganizationMembershipRole,
} from '#/modules/memberships/helpers/membership-helpers';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import type { InsertMembershipModel, MembershipModel } from '#/modules/memberships/memberships-db';
import { findMaxDisplayOrders, insertMembershipRows, insertMissingMembershipRows } from '#/modules/memberships/memberships-queries';
import type { EntityModel } from '#/tables';
import { log } from '#/utils/logger';

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
 * Batch-inserts direct memberships for existing users; `items` must already be deduped, normalized and valid.
 * Organization and associated parent memberships are upserted (unique constraint plus onConflictDoNothing), per-user `displayOrder`
 * comes from one grouped query spaced by `orderGap`, and the inserted target memberships are returned.
 */
export const insertMemberships = async <T extends BaseEntityModel>(
  ctx: DbContext,
  { items }: { items: Array<InsertMultipleProps<T>> },
): Promise<Array<MembershipBaseModel>> => {
  if (!items.length) return [];

  const userIds = Array.from(new Set(items.map((i) => i.userId)));

  // One query for per-user max(displayOrder), the baseline for the next order
  const maxOrderRows = await findMaxDisplayOrders(ctx, { userIds });

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

    const baseMembership = { userId, role, createdBy, displayOrder: nextOrder } as const;

    return { targetEntitiesIdColumnKeys, baseMembership, entity, extraFields: info.extraFields };
  });

  // Organization membership rows for sub-organization entities; unique constraint plus onConflictDoNothing makes this insert-if-missing.
  const organizationRows: InsertMembershipModel[] = prepared
    .filter(({ entity }) => entity.entityType !== 'organization')
    .map(({ baseMembership, targetEntitiesIdColumnKeys, entity }) => {
      return {
        ...baseMembership,
        tenantId: entity.tenantId,
        // Explicit escalation via the source channel organizationRoles map; a missing map throws
        role: resolveOrganizationMembershipRole(entity.entityType as ChannelEntityType, baseMembership.role),
        organizationId: targetEntitiesIdColumnKeys.organizationId,
        channelType: 'organization',
        channelId: targetEntitiesIdColumnKeys.organizationId,
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

      // Get the target entity's ID field to exclude it, but always preserve the organization ID
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

  const targetRows: InsertMembershipModel[] = prepared.map(({ baseMembership, targetEntitiesIdColumnKeys, entity, extraFields }) => ({
    ...baseMembership,
    tenantId: entity.tenantId,
    channelType: entity.entityType,
    channelId: entity.id,
    ...targetEntitiesIdColumnKeys,
    ...extraFields,
  }));

  const [insertedTarget] = await Promise.all([
    insertMembershipRows(ctx, { values: targetRows }),
    organizationRows.length ? insertMissingMembershipRows(ctx, { values: organizationRows }) : Promise.resolve(),
    associatedRows.length ? insertMissingMembershipRows(ctx, { values: associatedRows }) : Promise.resolve(),
  ]);

  if (insertedTarget.length) {
    log.info('Memberships created', { count: insertedTarget.length });
  }

  return insertedTarget;
};
