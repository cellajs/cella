import { and, eq, inArray, isNull } from 'drizzle-orm';
import { appConfig } from 'shared';
import type { DbOrTx } from '#/db/db';
import type { ModuleNotifications, NotificationSubjectRow } from '#/lib/module';
import { attachmentsTable } from '#/modules/attachment/attachment-db';

const liveAttachments = (ids: string[]) => and(inArray(attachmentsTable.id, ids), isNull(attachmentsTable.deletedAt));

/**
 * Notification source for attachments, the template consumer of the contract: mentions in the
 * description are the recipients. The description is edited through the collaborative editor,
 * so the Yjs document is its source of truth and derivation reads materialized writes as well as
 * client ones. Apps copy this shape and add `resolveRecipients` for their own audience model.
 */
export const attachmentNotifications: ModuleNotifications = {
  mentionable: true,
  deriveFrom: 'both',
  loadRows: async (tx: DbOrTx, ids: string[]): Promise<NotificationSubjectRow[]> =>
    tx.select().from(attachmentsTable).where(liveAttachments(ids)),
  writeMentions: async (tx: DbOrTx, id: string, mentions: string[]) => {
    await tx.update(attachmentsTable).set({ mentions }).where(eq(attachmentsTable.id, id));
  },
  loadPreview: async (tx: DbOrTx, subjectId: string) => {
    const [attachment] = await tx
      .select({ name: attachmentsTable.name, description: attachmentsTable.description })
      .from(attachmentsTable)
      .where(liveAttachments([subjectId]))
      .limit(1);
    return attachment ? { title: attachment.name, body: attachment.description ?? '' } : null;
  },
  loadContextNames: async (tx: DbOrTx, ids: string[]) => {
    const rows = await tx
      .select({ id: attachmentsTable.id, name: attachmentsTable.name })
      .from(attachmentsTable)
      .where(liveAttachments(ids));
    return new Map(rows.map((row) => [row.id, row.name]));
  },
  // Ids stand in for slugs: the channel route resolves either in `beforeLoad`, and the dialog param opens the row.
  resolveEmailLink: ({ tenantId, channelId, subjectId }) =>
    `${appConfig.frontendUrl}/${tenantId}/${channelId}/organization/attachments?attachmentDialogId=${subjectId}`,
};
