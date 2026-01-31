import { faker } from '@faker-js/faker';
import type { PageModel } from '#/db/schema/pages';
import { mockBatchResponse } from './mock-common';
import { mockNanoid, mockPaginated, mockTx, withFakerSeed } from './utils';

/**
 * Generates a mock page with all fields populated.
 * Uses deterministic seeding - same key produces same data.
 * Used for DB seeding, tests, and API response examples.
 */
export const mockPage = (key = 'page:default'): PageModel =>
  withFakerSeed(key, () => {
    const refDate = new Date('2025-01-01T00:00:00.000Z');
    const createdAt = faker.date.past({ refDate }).toISOString();
    const userId = mockNanoid();

    return {
      id: mockNanoid(),
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
      tx: mockTx(),
    };
  });

/** Alias for API response examples (page schema matches DB schema) */
export const mockPageResponse = mockPage;

/**
 * Generates a paginated mock page list response for getPages endpoint.
 */
export const mockPaginatedPagesResponse = (count = 2) => mockPaginated(mockPageResponse, count);

/**
 * Generates a mock batch pages response.
 * Used for createPages endpoint examples.
 */
export const mockBatchPagesResponse = (count = 2) => mockBatchResponse(mockPageResponse, count);
