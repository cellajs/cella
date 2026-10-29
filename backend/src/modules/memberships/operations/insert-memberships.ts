import { appConfig, type ChannelEntityType } from 'shared';
import { defaultOrder, orderGap } from 'shared/utils/display-order';
import type { DbContext } from '#/core/context';
import { channelIdColumnsOf, findMenuParent, membershipsBroughtAlong } from '#/modules/memberships/helpers/membership-helpers';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import type { InsertMembershipModel, MembershipModel } from '#/modules/memberships/memberships-db';
import { findMaxDisplayOrders, insertMembershipRows, insertMissingMembershipRows } from '#/modules/memberships/memberships-queries';
import type { EntityModel } from '#/tables';
import { log } from '#/utils/logger';

type BaseEntityModel = EntityModel<ChannelEntityType> & {
  [key: string]: unknown;
  tenantId: string;
};

interface InsertMultipleProps<T> {
  userId: string;
  role: MembershipModel['role'];
  entity: T;
  createdBy: string;
  /** Extra columns to set on the target membership row, such as an app's own. */
  extraFields?: Partial<InsertMembershipModel>;
}

/**
 * Batch-inserts direct memberships for existing users; `items` must already be deduped, normalized and valid.
 * Organization and associated parent memberships are inserted when missing, per-user `displayOrder` comes from one
 * grouped query spaced by `orderGap`, and the inserted target memberships are returned.
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
    const { userId, role, entity, createdBy } = info;

    const channelIdColumns = channelIdColumnsOf(entity);

    // Order per user: start at the global max and add orderGap per assignment, so a user's first membership takes `defaultOrder`.
    const prevMax = maxOrdersByUser.get(userId) ?? 0;
    const alreadyAssigned = assignedCounts.get(userId) ?? 0;
    const base = prevMax === 0 ? defaultOrder - orderGap : prevMax;
    const nextOrder = base + (alreadyAssigned + 1) * orderGap;

    assignedCounts.set(userId, alreadyAssigned + 1);

    const baseMembership = { userId, role, createdBy, displayOrder: nextOrder } as const;

    return { channelIdColumns, baseMembership, entity, extraFields: info.extraFields };
  });

  // The memberships each new one brings along, inserted when missing. A parent row keeps the target's id columns other
  // than the target's own; the organization row only the organization's.
  const broughtAlongRows = prepared.flatMap(({ baseMembership, channelIdColumns, entity }) => {
    const { [appConfig.entityIdColumnKeys[entity.entityType]]: _, ...parentIdColumns } = channelIdColumns;
    return membershipsBroughtAlong(entity, baseMembership.role, findMenuParent(entity.entityType)).map(
      ({ channelType, channelId, role }) =>
        ({
          ...baseMembership,
          tenantId: entity.tenantId,
          role,
          ...(channelType === 'organization' ? { organizationId: channelId } : parentIdColumns),
          channelType,
          channelId,
        }) as InsertMembershipModel,
    );
  });

  const targetRows: InsertMembershipModel[] = prepared.map(({ baseMembership, channelIdColumns, entity, extraFields }) => ({
    ...baseMembership,
    tenantId: entity.tenantId,
    channelType: entity.entityType,
    channelId: entity.id,
    ...channelIdColumns,
    ...extraFields,
  }));

  const [insertedTarget] = await Promise.all([
    insertMembershipRows(ctx, { values: targetRows }),
    broughtAlongRows.length ? insertMissingMembershipRows(ctx, { values: broughtAlongRows }) : Promise.resolve(),
  ]);

  if (insertedTarget.length) {
    log.info('Memberships created', { count: insertedTarget.length });
  }

  return insertedTarget;
};
