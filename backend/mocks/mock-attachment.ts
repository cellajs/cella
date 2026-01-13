import type { AttachmentModel } from '#/db/schema/attachments';
import { faker } from '@faker-js/faker';
import { withFakerSeed } from './utils';

/**
 * Generates a mock attachment with all fields populated.
 * Uses deterministic seeding - same key produces same data.
 * Used for DB seeding, tests, and API response examples.
 */
export const mockAttachment = (key = 'attachment:default'): AttachmentModel =>
  withFakerSeed(key, () => {
    const refDate = new Date('2025-01-01T00:00:00.000Z');
    const createdAt = faker.date.past({ refDate }).toISOString();
    const userId = faker.string.nanoid();
    const filename = faker.system.fileName();

    return {
      id: faker.string.nanoid(),
      entityType: 'attachment' as const,
      name: filename,
      description: null,
      public: false,
      bucketName: 'attachments',
      groupId: null,
      filename,
      contentType: faker.system.mimeType(),
      convertedContentType: null,
      size: String(faker.number.int({ min: 1000, max: 10_000_000 })),
      originalKey: `uploads/${faker.string.nanoid()}/${filename}`,
      convertedKey: null,
      thumbnailKey: null,
      createdAt,
      createdBy: userId,
      modifiedAt: createdAt,
      modifiedBy: userId,
      organizationId: faker.string.nanoid(),
    };
  });

/** Alias for API response examples (attachment schema matches DB schema) */
export const mockAttachmentResponse = mockAttachment;
