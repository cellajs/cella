import { faker } from '@faker-js/faker';
import type { AttachmentModel } from '#/db/schema/attachments';
import { mockBatchResponse } from './mock-common';
import {
  generateMockContextEntityIdColumns,
  mockNanoid,
  mockPaginated,
  mockTenantId,
  mockTx,
  withFakerSeed,
} from './utils';

/**
 * Generates a mock attachment with all fields populated.
 * Uses deterministic seeding - same key produces same data.
 * Context entity ID columns are generated dynamically based on relatable context entity types.
 */
export const mockAttachment = (key = 'attachment:default'): AttachmentModel =>
  withFakerSeed(key, () => {
    const refDate = new Date('2025-01-01T00:00:00.000Z');
    const createdAt = faker.date.past({ refDate }).toISOString();
    const userId = mockNanoid();
    const filename = faker.system.fileName();

    return {
      id: mockNanoid(),
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
      modifiedAt: createdAt,
      modifiedBy: userId,
      tx: mockTx(),
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
