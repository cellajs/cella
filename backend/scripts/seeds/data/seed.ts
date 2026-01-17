import { appConfig } from 'config';
import { checkMark, loadingMark } from '#/utils/console';
import { db } from '#/db/db';
import { pagesTable } from '#/db/schema/pages';
import { mockPage } from '../../../mocks/mock-page';
import { mockMany } from '../../../mocks/utils';
import { defaultAdminUser } from '../fixtures';

const isProduction = appConfig.mode === 'production';
const PAGES_COUNT = 10;

/**
 * Checks if there are any pages seeded in the database.
 */
const isPageSeeded = async () => {
  const pagesInTable = await db.select().from(pagesTable).limit(1);
  return pagesInTable.length > 0;
};

/**
 * Seeds the database with sample pages.
 */
export const dataSeed = async () => {
  console.info(` \n${loadingMark} Seeding pages...`);

  // Case: Production mode → skip seeding
  if (isProduction) return console.error('Not allowed in production.');

  // Case: Records already exist → skip seeding
  if (await isPageSeeded()) return console.warn('Pages table not empty → skip seeding');

  // Make many pages and assign to the seeded admin user
  const pageRecords = mockMany(mockPage, PAGES_COUNT).map((page) => ({
    ...page,
    createdBy: defaultAdminUser.id,
    modifiedBy: defaultAdminUser.id,
  }));
  await db.insert(pagesTable).values(pageRecords).onConflictDoNothing();

  console.info(` \n${checkMark} Created ${PAGES_COUNT} pages\n `);
};
