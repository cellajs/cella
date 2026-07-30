import { faker } from '@faker-js/faker';
import {
  generateMockEntityChannelIdColumns,
  mockBatchResponse,
  mockNanoid,
  mockPaginated,
  mockProductColumns,
  withFakerSeed,
} from '#/mocks';
import type { AttachmentModel } from '#/modules/attachment/attachment-db';
import { mockAuditUsers } from '#/schemas/entity-base-mocks';

/**
 * Generates a mock attachment with all fields populated.
 * Uses deterministic seeding - same key produces same data.
 * Channel entity ID columns are generated dynamically from the attachment's hierarchy ancestors.
 */
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
