import type { z } from 'zod';
import type { attachmentsTable } from '#/db/schema/attachments';
import { getImadoUrl } from '#/lib/imado-url';
import type { attachmentSchema } from '#/modules/attachments/schema';

type AttachmentSelect = typeof attachmentsTable.$inferSelect;
type Attachment = z.infer<typeof attachmentSchema>;

export const enrichAttachmentsWithUrls = async (attachments: AttachmentSelect[]): Promise<Attachment[]> => {
  return Promise.all(attachments.map(enrichAttachment));
};

export const enrichAttachmentWithUrls = async (attachment: AttachmentSelect): Promise<Attachment> => enrichAttachment(attachment);

const enrichAttachment = async ({ convertedKey, thumbnailKey, originalKey, ...attachment }: AttachmentSelect): Promise<Attachment> => {
  return {
    ...attachment,
    url: await getImadoUrl(convertedKey ?? originalKey),
    thumbnailUrl: thumbnailKey ? await getImadoUrl(thumbnailKey) : null,
  };
};
