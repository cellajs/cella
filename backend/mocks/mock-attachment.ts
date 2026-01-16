import { faker } from '@faker-js/faker';
import type { AttachmentModel } from '#/db/schema/attachments';
import { registerExample } from './example-registry';
import { generateMockContextEntityIdColumns, mockNanoid, withFakerSeed } from './utils';

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
      ...generateMockContextEntityIdColumns('relatable'),
    };
  });

/** Alias for API response examples (attachment schema matches DB schema) */
export const mockAttachmentResponse = mockAttachment;

// Self-register for OpenAPI examples
registerExample('Attachment', mockAttachmentResponse);
