import { appConfig } from 'shared';
import { defaultOrder, orderGap } from 'shared/utils/display-order';
import type { DbContext } from '#/core/context';
import type { ActorId } from '#/db/utils/ids';
import { type MembershipColumnsResolver, type MembershipEntity, onBackendModuleRegister } from '#/lib/module';
import { channelIdColumnsOf, findMenuParent, membershipsBroughtAlong } from '#/modules/memberships/helpers/membership-helpers';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import type { InsertMembershipModel, MembershipModel } from '#/modules/memberships/memberships-db';
import { findMaxDisplayOrders, insertMembershipRows, insertMissingMembershipRows } from '#/modules/memberships/memberships-queries';
import { log } from '#/utils/logger';

const columnResolvers: MembershipColumnsResolver[] = [];

onBackendModuleRegister(({ membershipColumns }) => {
  if (membershipColumns) columnResolvers.push(membershipColumns);
});

/** The modules' own columns for a membership of `entity` at `role`, in registration order; a later module's win. */
const resolveMembershipModuleColumns = async (
  ctx: DbContext,
  { userId, role, entity }: { userId: string; role: MembershipModel['role']; entity: MembershipEntity },
) => {
  const columns: Partial<InsertMembershipModel> = {};
  for (const resolve of columnResolvers) Object.assign(columns, await resolve(ctx, { userId, role, entity }));
  return columns;
};

interface InsertMultipleProps<T> {
  userId: string;
  role: MembershipModel['role'];
  entity: T;
  createdBy: ActorId;
  /** Extra columns to set on the target membership row, such as an app's own. */
  extraFields?: Partial<InsertMembershipModel>;
}

/**
 * Batch-inserts direct memberships for existing users; `items` must already be deduped, normalized and valid.
 * Organization and associated parent memberships are inserted when missing, per-user `displayOrder` comes from one
 * grouped query spaced by `orderGap`, and the inserted target memberships are returned.
 */
export const insertMemberships = async <T extends MembershipEntity>(
  ctx: DbContext,
  { items: givenItems }: { items: Array<InsertMultipleProps<T>> },
): Promise<Array<MembershipBaseModel>> => {
  if (!givenItems.length) return [];

  // Ahead of the order baseline: a resolver may insert memberships, whose order this run then continues from.
  const items: Array<InsertMultipleProps<T>> = [];
  for (const item of givenItems) {
    items.push({ ...item, extraFields: item.extraFields ?? (await resolveMembershipModuleColumns(ctx, item)) });
  }

  const userIds = Array.from(new Set(items.map((i) => i.userId)));

  const maxOrderRows = await findMaxDisplayOrders(ctx, { userIds });
  const maxOrdersByUser = new Map<string, number>(maxOrderRows.map((r) => [r.userId, r.maxOrder]));

  // Rows assigned per user in this run, to step the order by orderGap
  const assignedCounts = new Map<string, number>();

  const prepared = items.map(({ userId, role, entity, createdBy, extraFields }) => {
    const channelIdColumns = channelIdColumnsOf(entity);

    // Order per user: start at the global max and add orderGap per assignment, so a user's first membership takes `defaultOrder`.
    const prevMax = maxOrdersByUser.get(userId) ?? 0;
    const alreadyAssigned = assignedCounts.get(userId) ?? 0;
    const base = prevMax === 0 ? defaultOrder - orderGap : prevMax;
    const nextOrder = base + (alreadyAssigned + 1) * orderGap;

    assignedCounts.set(userId, alreadyAssigned + 1);

    const baseMembership = { userId, role, createdBy, displayOrder: nextOrder } as const;

    return { channelIdColumns, baseMembership, entity, extraFields };
  });

  // The memberships each new one brings along, inserted when missing. A parent row keeps the target's id columns other
  // than the target's own; the organization row only the organization's.
  const broughtAlongRows = prepared.flatMap(({ baseMembership, channelIdColumns, entity }) => {
    const { [appConfig.entityIdColumnKeys[entity.entityType]]: _, ...parentIdColumns } = channelIdColumns;
    return membershipsBroughtAlong(entity, baseMembership.role, findMenuParent(entity.entityType)).map(
      ({ channelType, channelId, role }): InsertMembershipModel => ({
        ...baseMembership,
        ...(channelType === 'organization' ? {} : parentIdColumns),
        organizationId: channelIdColumns.organizationId,
        tenantId: entity.tenantId,
        role,
        channelType,
        channelId,
      }),
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

  if (insertedTarget.length) log.info('Memberships created', { count: insertedTarget.length });

  return insertedTarget;
};
