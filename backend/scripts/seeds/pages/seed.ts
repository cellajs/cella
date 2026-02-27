import { appConfig } from 'shared';
import { startSpinner, succeedSpinner, warnSpinner } from '#/utils/console';
import { migrationDb } from '#/db/db';
import { pagesTable } from '#/db/schema/pages';
import { tenantsTable } from '#/db/schema/tenants';
import { mockPage } from '../../../mocks/mock-page';
import { mockMany, setMockContext } from '../../../mocks/utils';
import { defaultAdminUser, PUBLIC_TENANT_ID, publicTenant } from '../fixtures';

// Seed scripts use admin connection (migrationDb) for privileged operations
const db = migrationDb;

// Set mock context for seed script - IDs will get 'gen-' prefix
setMockContext('script');

const isProduction = appConfig.mode === 'production';
const PAGES_COUNT = 10;

/**
 * Checks if there are any pages seeded in the database.
 */
const isPageSeeded = async () => {
  if (!db) return true; // Skip if no admin connection
  const pagesInTable = await db.select().from(pagesTable).limit(1);
  return pagesInTable.length > 0;
};

/**
 * Seeds the database with sample pages.
 */
export const pagesSeed = async () => {
  const spinner = startSpinner('Seeding pages...');

  // Case: Production mode → skip seeding
  if (isProduction) {
    spinner.fail('Not allowed in production.');
    return;
  }

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
  await db.insert(tenantsTable).values({ id: publicTenant.id, name: publicTenant.name }).onConflictDoNothing();

  // Make many pages and assign to the seeded admin user
  // Pages use PUBLIC_TENANT_ID (platform-wide content, not org-scoped)
  const pageRecords = mockMany(mockPage, PAGES_COUNT).map((page) => ({
    ...page,
    tenantId: PUBLIC_TENANT_ID,
    createdBy: defaultAdminUser.id,
    modifiedBy: defaultAdminUser.id,
  }));
  await db.insert(pagesTable).values(pageRecords).onConflictDoNothing();

  succeedSpinner(`Created ${PAGES_COUNT} pages`);
};
