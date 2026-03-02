import { faker } from '@faker-js/faker';
import { nanoid } from 'shared/nanoid';
import type { InsertPageModel, PageModel } from '#/db/schema/pages';
import { mockBatchResponse } from './mock-common';
import { mockNanoid, mockPaginated, mockStx, mockTenantId, pastIsoDate, withFakerSeed } from './utils';

/**
 * Generates a single BlockNote block.
 */
const makeBlock = (type: string, text: string, props: Record<string, unknown> = {}) => ({
  id: nanoid(),
  type,
  props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left', ...props },
  content: [{ type: 'text', text, styles: {} }],
  children: [],
});

/**
 * Generates a list of BlockNote blocks (bulletListItem or numberedListItem).
 */
const makeListBlocks = (type: 'bulletListItem' | 'numberedListItem', count: number) =>
  Array.from({ length: count }, () => makeBlock(type, faker.lorem.sentence()));

/**
 * Generates rich BlockNote JSON content with mixed block types.
 * Produces a realistic page with headings, paragraphs, lists, and check items.
 */
const generateBlockNoteContent = (): string => {
  const blocks = [
    // Heading
    makeBlock('heading', faker.lorem.sentence({ min: 3, max: 7 }), { level: 2 }),
    // Intro paragraph
    makeBlock('paragraph', faker.lorem.paragraph({ min: 2, max: 4 })),
    // Another heading
    makeBlock('heading', faker.company.catchPhrase(), { level: 3 }),
    // Bullet list
    ...makeListBlocks('bulletListItem', faker.number.int({ min: 2, max: 4 })),
    // Paragraph
    makeBlock('paragraph', faker.lorem.paragraph({ min: 1, max: 3 })),
    // Numbered list
    ...makeListBlocks('numberedListItem', faker.number.int({ min: 2, max: 3 })),
    // Check list items
    ...Array.from({ length: faker.number.int({ min: 2, max: 3 }) }, () =>
      makeBlock('checkListItem', faker.hacker.phrase(), { checked: faker.datatype.boolean() }),
    ),
    // Closing paragraph
    makeBlock('paragraph', faker.lorem.paragraphs({ min: 1, max: 2 })),
  ];

  return JSON.stringify(blocks);
};

/**
 * Generates a mock page record for DB inserts (unique per call).
 * Uses random IDs so mockMany produces distinct records.
 */
export const mockPage = (): InsertPageModel => {
  const createdAt = pastIsoDate();

  return {
    id: nanoid(),
    tenantId: mockTenantId(),
    entityType: 'page' as const,
    name: faker.lorem.sentence({ min: 2, max: 5 }),
    description: generateBlockNoteContent(),
    keywords: faker.lorem.words(3),
    status: 'unpublished' as const,
    publicAccess: true,
    parentId: null,
    displayOrder: faker.number.float({ min: 0, max: 100, fractionDigits: 2 }),
    createdAt,
    createdBy: null,
    modifiedAt: createdAt,
    modifiedBy: null,
    stx: mockStx(),
  };
};

/**
 * Generates a mock page API response with deterministic seeding.
 * Same key produces same data across runs. Used for OpenAPI examples.
 */
export const mockPageResponse = (key = 'page:default'): PageModel =>
  withFakerSeed(key, () => {
    const refDate = new Date('2025-01-01T00:00:00.000Z');
    const createdAt = faker.date.past({ refDate }).toISOString();
    const userId = mockNanoid();

    return {
      id: mockNanoid(),
      tenantId: mockTenantId(),
      entityType: 'page' as const,
      name: faker.lorem.sentence({ min: 2, max: 5 }),
      description: generateBlockNoteContent(),
      keywords: faker.lorem.words(3),
      status: 'unpublished' as const,
      publicAccess: true,
      parentId: null,
      displayOrder: faker.number.float({ min: 0, max: 100, fractionDigits: 2 }),
      createdAt,
      createdBy: userId,
      modifiedAt: createdAt,
      modifiedBy: userId,
      stx: mockStx(),
    };
  });

/**
 * Generates a paginated mock page list response for getPages endpoint.
 */
export const mockPaginatedPagesResponse = (count = 2) => mockPaginated(mockPageResponse, count);

/**
 * Generates a mock batch pages response.
 * Used for createPages endpoint examples.
 */
export const mockBatchPagesResponse = (count = 2) => mockBatchResponse(mockPageResponse, count);
