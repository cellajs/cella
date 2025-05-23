import type { z } from 'zod';
import type { attachmentsTable } from '#/db/schema/attachments';
import { getSignedUrl } from '#/lib/signed-url';
import type { attachmentSchema } from '#/modules/attachments/schema';

type AttachmentSelect = typeof attachmentsTable.$inferSelect;
type Attachment = z.infer<typeof attachmentSchema>;

export const processAttachmentUrlsBatch = async (attachments: AttachmentSelect[]): Promise<Attachment[]> => {
  return Promise.all(attachments.map(processAttachment));
};

export const processAttachmentUrls = async (attachment: AttachmentSelect): Promise<Attachment> => processAttachment(attachment);

const processAttachment = async ({ convertedKey, thumbnailKey, originalKey, ...attachment }: AttachmentSelect): Promise<Attachment> => {
  return {
    ...attachment,
    url: await getSignedUrl(originalKey),
    thumbnailUrl: thumbnailKey ? await getSignedUrl(thumbnailKey) : null,
    convertedUrl: convertedKey ? await getSignedUrl(convertedKey) : null,
  };
};
