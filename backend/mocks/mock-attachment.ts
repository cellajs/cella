import { faker } from '@faker-js/faker';
import type { AttachmentModel } from '#/db/schema/attachments';
import {
  generateMockContextEntityIdColumns,
  MOCK_REF_DATE,
  mockBatchResponse,
  mockNanoid,
  mockPaginated,
  mockStx,
  mockTenantId,
  mockUuid,
  withFakerSeed,
} from './utils';

/**
 * Generates a mock attachment with all fields populated.
 * Uses deterministic seeding - same key produces same data.
 * Context entity ID columns are generated dynamically based on relatable context entity types.
 */
export const mockAttachment = (key = 'attachment:default'): AttachmentModel =>
  withFakerSeed(key, () => {
    const refDate = MOCK_REF_DATE;
    const createdAt = faker.date.past({ refDate }).toISOString();
    const userId = mockUuid();
    const filename = faker.system.fileName();

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
      seq: faker.number.int({ min: 1, max: 500 }),
      stx: mockStx(),
      ...generateMockContextEntityIdColumns('relatable'),
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
