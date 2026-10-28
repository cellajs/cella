import { and, eq } from 'drizzle-orm';
import type { ChannelEntityType } from 'shared';
import type { DbContext } from '#/core/context';
import { membershipsTable } from '#/modules/memberships/memberships-db';

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
