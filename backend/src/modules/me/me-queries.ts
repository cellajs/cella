import { and, eq, getColumns, inArray, isNotNull, isNull, or } from 'drizzle-orm';
import { appConfig, type ChannelEntityType, hierarchy } from 'shared';
import type { DbContext } from '#/core/context';
import { inactiveMembershipsTable } from '#/modules/memberships/inactive-memberships-db';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { channelBaseSchema } from '#/schemas/entity-base';
import { getEntityTable } from '#/tables';
import { pick } from '#/utils/pick';

interface DeleteMyMembershipOpts {
  userId: string;
  channelType: ChannelEntityType;
  channelId: string;
}

/** Deletes the user's membership of one channel; undefined when they hold none there. */
export const deleteMyMembership = async (ctx: DbContext, { userId, channelType, channelId }: DeleteMyMembershipOpts) => {
  const [deleted] = await ctx.var.db
    .delete(membershipsTable)
    .where(and(eq(membershipsTable.userId, userId), eq(membershipsTable.channelType, channelType), eq(membershipsTable.channelId, channelId)))
    .returning({ id: membershipsTable.id });
  return deleted;
};

interface FindPendingInvitationsOpts {
  userId: string;
}

/** The user's open invitations: inactive memberships not rejected, each with its channel's base columns. */
export const findPendingInvitations = async (ctx: DbContext, { userId }: FindPendingInvitationsOpts) => {
  const { db } = ctx.var;
  const results = await Promise.all(
    appConfig.channelEntityTypes.map((channelType) => {
      const channelTable = getEntityTable(channelType);
      const cols = getColumns(channelTable);
      const keys = Object.keys(channelBaseSchema.shape) as (keyof typeof channelBaseSchema.shape)[];
      const channelBaseSelect = pick(cols, keys);
      const prepareRoles = hierarchy.getPrepareRoles(channelType);

      return db
        .select({ entity: channelBaseSelect, inactiveMembership: inactiveMembershipsTable })
        .from(inactiveMembershipsTable)
        .innerJoin(channelTable, eq(channelTable.id, inactiveMembershipsTable.channelId))
        .where(
          and(
            eq(inactiveMembershipsTable.channelType, channelType),
            eq(inactiveMembershipsTable.userId, userId),
            isNull(inactiveMembershipsTable.rejectedAt),
            // An invitation to an unpublished channel stays hidden until it is published, except one for a prepare role:
            // its email went out at once, so the invitee must be able to answer it.
            or(isNotNull(cols.publishedAt), prepareRoles.length ? inArray(inactiveMembershipsTable.role, prepareRoles) : undefined),
          ),
        );
    }),
  );

  return results.flat();
};
