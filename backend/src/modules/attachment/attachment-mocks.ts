import { faker } from '@faker-js/faker';
import { appConfig } from 'shared';
import { generateMockEntityChannelIdColumns, mockBatchResponse, mockNanoid, mockPaginated, mockProductColumns, withFakerSeed } from '#/mocks';
import type { AttachmentModel } from '#/modules/attachment/attachment-db';
import { mockAuditUsers } from '#/schemas/entity-base-mocks';

/** Deterministic: the same key produces the same data. */
export const mockAttachment = (key = 'attachment:default'): AttachmentModel =>
  withFakerSeed(key, () => {
    const filename = faker.system.fileName();
    const channelIds = generateMockEntityChannelIdColumns('attachment');

    return {
      ...mockProductColumns('attachment', { name: filename, description: null }),
      publicBucket: false,
      bucketName: 'attachments',
      groupId: null,
      filename,
      contentType: faker.system.mimeType(),
      convertedContentType: null,
      size: String(faker.number.int({ min: 1000, max: 10_000_000 })),
      keys: { original: `uploads/${mockNanoid()}/${filename}` },
      ...channelIds,
    };
  });

/** Attachment wire response with audit-user IDs hydrated to minimal user objects. */
export const mockAttachmentResponse = (key = 'attachment:default') => {
  const attachment = mockAttachment(key);
  return { ...attachment, ...mockAuditUsers(attachment, key) };
};

export const mockPaginatedAttachmentsResponse = (count = 2) => mockPaginated(mockAttachmentResponse, count);

export const mockBatchAttachmentsResponse = (count = 2) => mockBatchResponse(mockAttachmentResponse, count);

/** One signed download URL as `getPresignedUrls` returns it. The signature is truncated, and the ungenerated variant resolves to the original key. */
const mockPresignedUrlItem = (key = 'attachment:default') => {
  const attachment = mockAttachment(key);
  return {
    attachmentId: attachment.id,
    variant: 'thumbnail',
    url: `https://${attachment.bucketName}.${appConfig.s3.host}/${attachment.keys.original}?X-Amz-Signature=…`,
  };
};

export const mockPresignedUrlsResponse = (count = 2) => mockBatchResponse(mockPresignedUrlItem, count);
