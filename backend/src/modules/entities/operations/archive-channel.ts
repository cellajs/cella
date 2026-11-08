import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { buildSubjectFromEntity, type ChannelEntityType, checkAccessBatch, entityIdColumnName, hierarchy, isChannel } from 'shared';
import type { OrgContext } from '#/core/context';
import { channelTables } from '#/db/channel-tables';
import { updateStamps } from '#/db/utils/stamps';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { toReaders } from '#/modules/entities/stream/audiences';
import { sendSignal } from '#/modules/entities/stream/send-signal';
import { accessFrom } from '#/permissions/access';
import { draftChannelVisibleTo } from '#/permissions/channel-collection-scope';
import { getValidChannel } from '#/permissions/get-valid-channel';
import { log } from '#/utils/logger';

interface ArchiveChannelInput {
  channelType: ChannelEntityType;
  channelId: string;
  includeDescendants?: boolean;
  /** The state to set: true archives, false unarchives. */
  archived: boolean;
}

/**
 * Archives or unarchives a channel below the organization, which needs `update` on it, and with `includeDescendants`
 * the channels inside it that the caller may update. Every channel row carries every ancestor id, so one statement per
 * descendant type reaches every depth. A descendant the caller reads but may not update keeps its state and comes back
 * in `rejectedIds`; one it may not read is left alone and unnamed.
 * @throws The refusals of `getValidChannel` for `update`, which skips the archive check here alone.
 */
export async function archiveChannelOp(ctx: OrgContext, { channelType, channelId, includeDescendants = false, archived }: ArchiveChannelInput) {
  const { tenantId, organizationId } = ctx.var;
  const actorId = ctx.var.actor.id;
  const access = accessFrom(ctx);

  const { channel, changedIds, rejectedIds } = await ctx.var.db.transaction(async (tx) => {
    const txCtx = { var: { ...ctx.var, db: tx } };
    const { entity: channel } = await getValidChannel(txCtx, channelId, channelType, 'update', { forUpdate: true, ignoreArchive: true });

    const changedIds: string[] = [];
    const rejectedIds: string[] = [];
    if (channel.archived !== archived) {
      const table = channelTables[channelType]();
      await tx
        .update(table)
        .set({ archived, ...updateStamps(actorId) })
        .where(eq(table.id, channel.id));
      changedIds.push(channel.id);
    }
    if (!includeDescendants) return { channel, changedIds, rejectedIds };

    for (const descendantType of hierarchy.getOrderedDescendants(channelType).filter(isChannel)) {
      const table = channelTables[descendantType]();
      const insideChannel = sql`${table}.${sql.identifier(entityIdColumnName(channelType))} = ${channel.id}`;
      const rows = await tx
        .select()
        .from(table)
        .where(and(insideChannel, ne(table.archived, archived)));
      if (!rows.length) continue;

      const subjects = rows.map((row) => buildSubjectFromEntity(descendantType, row));
      const [reads, updates] = [checkAccessBatch(access, 'read', subjects), checkAccessBatch(access, 'update', subjects)];
      const allowedIds: string[] = [];
      for (const row of rows) {
        if (updates.get(row.id)?.allowed) allowedIds.push(row.id);
        else if (reads.get(row.id)?.allowed && draftChannelVisibleTo(descendantType, row, access)) rejectedIds.push(row.id);
      }
      if (!allowedIds.length) continue;

      await tx
        .update(table)
        .set({ archived, ...updateStamps(actorId) })
        .where(inArray(table.id, allowedIds));
      changedIds.push(...allowedIds);
    }
    return { channel, changedIds, rejectedIds };
  });

  if (changedIds.length) {
    invalidateCache.org(tenantId, organizationId);
    await sendSignal('channel.archived', toReaders(buildSubjectFromEntity(channelType, channel)), { organizationId, subjectId: channel.id });
  }
  log.info(archived ? 'Channel archived' : 'Channel unarchived', { channelType, channelId: channel.id, changedIds, rejectedIds });

  return { data: [], rejectedIds };
}
