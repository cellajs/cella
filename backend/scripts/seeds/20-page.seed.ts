import type { SeedScript } from '../types';
import { appConfig } from 'shared';
import { startSpinner, succeedSpinner, warnSpinner } from '#/utils/console';
import { migrationDb } from '#/db/db';
import { pagesTable } from '#/db/schema/pages';
import { tenantsTable } from '#/db/schema/tenants';
import { mockPage } from '../../mocks/mock-page';
import { mockMany, setMockContext } from '../../mocks/utils';
import { defaultAdminUser } from '../fixtures';

// Seed scripts use admin connection (migrationDb) for privileged operations
const db = migrationDb;

// Set mock context for seed script - IDs will get 'gen-' prefix
setMockContext('script');
const PUBLISHED_COUNT = 5;
const UNPUBLISHED_COUNT = 5;

/**
 * Checks if there are any pages seeded in the database.
 */
const isPageSeeded = async () => {
  if (!db) return true; // Skip if no admin connection
  const pagesInTable = await db.select().from(pagesTable).limit(1);
  return pagesInTable.length > 0;
};

/**
 * Seeds the database with sample pages (published and unpublished).
 */
export const pagesSeed = async () => {
  const spinner = startSpinner('Seeding pages...');

  // Admin connection required
  if (!db) {
    spinner.fail('DATABASE_ADMIN_URL required for seeding');
    return;
  }

  // Case: Records already exist → skip seeding
  if (await isPageSeeded()) {
    warnSpinner('Pages table not empty → skip seeding');
    return;
  }

  // Ensure public tenant exists (needed for pages)
  await db.insert(tenantsTable).values({ id: appConfig.publicTenant.id, name: appConfig.publicTenant.name }).onConflictDoNothing();

  // Generate published pages
  const publishedPages = mockMany(mockPage, PUBLISHED_COUNT).map((page) => ({
    ...page,
    status: 'published' as const,
    tenantId: appConfig.publicTenant.id,
    createdBy: defaultAdminUser.id,
    modifiedBy: defaultAdminUser.id,
  }));

  // Generate unpublished pages
  const unpublishedPages = mockMany(mockPage, UNPUBLISHED_COUNT).map((page) => ({
    ...page,
    status: 'unpublished' as const,
    tenantId: appConfig.publicTenant.id,
    createdBy: defaultAdminUser.id,
    modifiedBy: defaultAdminUser.id,
  }));

  const totalCount = PUBLISHED_COUNT + UNPUBLISHED_COUNT;
  await db.insert(pagesTable).values([...publishedPages, ...unpublishedPages]).onConflictDoNothing();

  succeedSpinner(`Created ${totalCount} pages (${PUBLISHED_COUNT} published, ${UNPUBLISHED_COUNT} unpublished)`);
};

export const seedConfig: SeedScript = { name: 'pages', run: pagesSeed };
