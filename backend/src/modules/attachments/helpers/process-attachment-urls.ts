import type { attachmentsTable } from '#/db/schema/attachments';
import { getSignedUrlFromKey } from '#/lib/signed-url';
import type { attachmentSchema } from '#/modules/attachments/schema';
import type { z } from '@hono/zod-openapi';

type AttachmentSelect = typeof attachmentsTable.$inferSelect;
type Attachment = z.infer<typeof attachmentSchema>;

export const processAttachmentUrlsBatch = async (attachments: AttachmentSelect[]): Promise<Attachment[]> => {
  return Promise.all(attachments.map(processAttachment));
};

export const processAttachmentUrls = async (attachment: AttachmentSelect): Promise<Attachment> => processAttachment(attachment);

const processAttachment = async ({ convertedKey, thumbnailKey, originalKey, ...attachment }: AttachmentSelect): Promise<Attachment> => {
  const urlOptions = { isPublic: attachment.public };
  return {
    ...attachment,
    url: await getSignedUrlFromKey(originalKey, urlOptions),
    thumbnailUrl: thumbnailKey ? await getSignedUrlFromKey(thumbnailKey, urlOptions) : null,
    convertedUrl: convertedKey ? await getSignedUrlFromKey(convertedKey, urlOptions) : null,
  };
};
