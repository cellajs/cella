import { faker } from '@faker-js/faker';
import {
  generateMockEntityChannelIdColumns,
  MOCK_REF_DATE,
  mockBatchResponse,
  mockNanoid,
  mockPaginated,
  mockStx,
  mockTenantId,
  mockUuid,
  withFakerSeed,
} from '#/mocks';
import type { AttachmentModel } from '#/modules/attachment/attachment-db';

/**
 * Generates a mock attachment with all fields populated.
 * Uses deterministic seeding - same key produces same data.
 * Channel entity ID columns are generated dynamically from the attachment's hierarchy ancestors.
 */
export const mockAttachment = (key = 'attachment:default'): AttachmentModel =>
  withFakerSeed(key, () => {
    const refDate = MOCK_REF_DATE;
    const createdAt = faker.date.past({ refDate }).toISOString();
    const userId = mockUuid();
    const filename = faker.system.fileName();
    const channelIds = generateMockEntityChannelIdColumns('attachment');

    return {
      id: mockUuid(),
      tenantId: mockTenantId(),
      entityType: 'attachment' as const,
      name: filename,
      description: null,
      keywords: faker.lorem.words(3),
      public: false,
      bucketName: 'attachments',
      groupId: null,
      filename,
      contentType: faker.system.mimeType(),
      convertedContentType: null,
      size: String(faker.number.int({ min: 1000, max: 10_000_000 })),
      originalKey: `uploads/${mockNanoid()}/${filename}`,
      convertedKey: null,
      thumbnailKey: null,
      createdAt,
      createdBy: userId,
      updatedAt: createdAt,
      updatedBy: userId,
      deletedAt: null,
      deletedBy: null,
      publicAt: null,
      seq: faker.number.int({ min: 1, max: 500 }),
      stx: mockStx(),
      ...channelIds,
    };
  });

/** Alias for API response examples (attachment schema matches DB schema) */
export const mockAttachmentResponse = mockAttachment;

/**
 * Generates a paginated mock attachment list response for getAttachments endpoint.
 */
export const mockPaginatedAttachmentsResponse = (count = 2) => mockPaginated(mockAttachmentResponse, count);

/**
 * Generates a mock batch attachments response.
 * Used for createAttachments endpoint examples.
 */
export const mockBatchAttachmentsResponse = (count = 2) => mockBatchResponse(mockAttachmentResponse, count);
