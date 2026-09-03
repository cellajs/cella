import { and, inArray, isNull } from 'drizzle-orm';
import { appConfig } from 'shared';
import type { DbOrTx } from '#/db/db';
import type { ModuleNotifications, NotificationSubjectRow } from '#/lib/module';
import { attachmentsTable } from '#/modules/attachment/attachment-db';

const liveAttachments = (ids: string[]) => and(inArray(attachmentsTable.id, ids), isNull(attachmentsTable.deletedAt));

/**
 * Notification source for attachments, the template's worked example of the contract: the
 * uploader is told when someone else edits their attachment (a rename). Attachments carry no
 * composer, so they are not mentionable; a mentionable module adds `mentionable`, a `mentions`
 * column and `writeMentions` on top of this shape.
 */
export const attachmentNotifications: ModuleNotifications = {
  loadRows: async (tx: DbOrTx, ids: string[]): Promise<NotificationSubjectRow[]> =>
    tx.select().from(attachmentsTable).where(liveAttachments(ids)),
  // The fan-out drops the actor, so the uploader's own edits never notify them.
  resolveRecipients: async (_tx: DbOrTx, row: NotificationSubjectRow) =>
    row.createdBy ? [{ userId: row.createdBy, type: 'edit' }] : [],
  loadPreview: async (tx: DbOrTx, subjectId: string) => {
    const [attachment] = await tx
      .select({ name: attachmentsTable.name, filename: attachmentsTable.filename })
      .from(attachmentsTable)
      .where(liveAttachments([subjectId]))
      .limit(1);
    return attachment ? { title: attachment.name, body: attachment.filename } : null;
  },
  loadContextNames: async (tx: DbOrTx, ids: string[]) => {
    const rows = await tx
      .select({ id: attachmentsTable.id, name: attachmentsTable.name })
      .from(attachmentsTable)
      .where(liveAttachments(ids));
    return new Map(rows.map((row) => [row.id, row.name]));
  },
  // Ids stand in for slugs: the channel route resolves either in `beforeLoad`.
  resolveEmailLink: ({ tenantId, channelId }) =>
    `${appConfig.frontendUrl}/${tenantId}/${channelId}/organization/attachments`,
};
