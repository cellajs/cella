import { faker } from '@faker-js/faker';
import type { PageModel } from '#/db/schema/pages';
import { withFakerSeed } from './utils';

/**
 * Generates a mock page with all fields populated.
 * Uses deterministic seeding - same key produces same data.
 * Used for DB seeding, tests, and API response examples.
 */
export const mockPage = (key = 'page:default'): PageModel =>
  withFakerSeed(key, () => {
    const refDate = new Date('2025-01-01T00:00:00.000Z');
    const createdAt = faker.date.past({ refDate }).toISOString();
    const userId = faker.string.nanoid();

    return {
      id: faker.string.nanoid(),
      entityType: 'page' as const,
      name: faker.lorem.sentence({ min: 2, max: 5 }),
      description: JSON.stringify([
        {
          content: [{ type: 'text', text: faker.lorem.paragraphs(2), styles: {} }],
          children: [],
        },
      ]),
      keywords: faker.lorem.words(3),
      status: 'unpublished' as const,
      parentId: null,
      displayOrder: faker.number.float({ min: 0, max: 100, fractionDigits: 2 }),
      createdAt,
      createdBy: userId,
      modifiedAt: createdAt,
      modifiedBy: userId,
    };
  });

/** Alias for API response examples (page schema matches DB schema) */
export const mockPageResponse = mockPage;
