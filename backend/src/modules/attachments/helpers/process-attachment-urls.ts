import type { z } from '@hono/zod-openapi';
import type { attachmentsTable } from '#/db/schema/attachments';
import { getSignedUrlFromKey } from '#/lib/signed-url';
import type { attachmentSchema } from '#/modules/attachments/schema';

type AttachmentSelect = typeof attachmentsTable.$inferSelect;
type Attachment = z.infer<typeof attachmentSchema>;

export const processAttachmentUrlsInBatch = async (attachments: AttachmentSelect[]): Promise<Attachment[]> => {
  return Promise.all(attachments.map(processAttachment));
};

export const processAttachmentUrls = async (attachment: AttachmentSelect): Promise<Attachment> => processAttachment(attachment);

const processAttachment = async ({ convertedKey, thumbnailKey, originalKey, ...attachment }: AttachmentSelect): Promise<Attachment> => {
  const urlOptions = { isPublic: attachment.public, bucketName: attachment.bucketName };

  const [url, thumbnailUrl, convertedUrl] = await Promise.all([
    getSignedUrlFromKey(originalKey, urlOptions),
    thumbnailKey ? getSignedUrlFromKey(thumbnailKey, urlOptions) : null,
    convertedKey ? getSignedUrlFromKey(convertedKey, urlOptions) : null,
  ]);

  return { ...attachment, url, thumbnailUrl, convertedUrl };
};
