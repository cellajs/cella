import type { SeedScript } from '../types';
import { startSpinner, succeedSpinner, warnSpinner } from '#/utils/console';
import { seedDb } from '#/db/db';
import { pagesTable } from '#/db/schema/pages';
import { mockPage } from '../../mocks/mock-page';
import { mockMany, setMockContext } from '../../mocks/utils';
import { defaultAdminUser } from '../fixtures';

// Seed scripts use admin connection for privileged operations
const db = seedDb;

// Set mock context for seed script - UUIDs get '00000000-' prefix, nanoids get 'gen-' prefix
setMockContext('script');
const PUBLISHED_COUNT = 5;
const UNPUBLISHED_COUNT = 5;

/**
 * Checks if there are any pages seeded in the database.
 */
const isPageSeeded = async () => {
  const pagesInTable = await db.select().from(pagesTable).limit(1);
  return pagesInTable.length > 0;
};

/**
 * Seeds the database with sample pages (published and unpublished).
 */
export const pagesSeed = async () => {
  startSpinner('Seeding pages...');

  // Case: Records already exist → skip seeding
  if (await isPageSeeded()) {
    warnSpinner('Pages table not empty → skip seeding');
    return;
  }

  // Generate published pages
  const publishedPages = mockMany(mockPage, PUBLISHED_COUNT).map((page) => ({
    ...page,
    status: 'published' as const,
    createdBy: defaultAdminUser.id,
    updatedBy: defaultAdminUser.id,
  }));

  // Generate unpublished pages
  const unpublishedPages = mockMany(mockPage, UNPUBLISHED_COUNT).map((page) => ({
    ...page,
    status: 'unpublished' as const,
    createdBy: defaultAdminUser.id,
    updatedBy: defaultAdminUser.id,
  }));

  const totalCount = PUBLISHED_COUNT + UNPUBLISHED_COUNT;
  await db.insert(pagesTable).values([...publishedPages, ...unpublishedPages]).onConflictDoNothing();

  succeedSpinner(`Created ${totalCount} pages (${PUBLISHED_COUNT} published, ${UNPUBLISHED_COUNT} unpublished)`);
};

export const seedConfig: SeedScript = { name: 'pages', run: pagesSeed };
