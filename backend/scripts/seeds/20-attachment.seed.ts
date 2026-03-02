import type { SeedScript } from '../types';
import { appConfig } from 'shared';
import { startSpinner, succeedSpinner, warnSpinner } from '#/utils/console';
import { migrationDb } from '#/db/db';
import { attachmentsTable } from '#/db/schema/attachments';
import { organizationsTable } from '#/db/schema/organizations';
import { mockAttachment } from '../../mocks/mock-attachment';
import { setMockContext } from '../../mocks/utils';
import { defaultAdminUser } from '../fixtures';

// Seed scripts use admin connection (migrationDb) for privileged operations
const db = migrationDb;

// Set mock context for seed script - IDs will get 'gen-' prefix
setMockContext('script');

/**
 * Known S3 files that should exist in the dev bucket under the `seed/` prefix.
 * Each seeded organization gets one attachment per file.
 */
const SEED_FILES = [
  { filename: 'sample-image.webp', contentType: 'image/webp', size: '24500', originalKey: 'seed/sample-image.webp', public: true },
  { filename: 'sample-document.pdf', contentType: 'application/pdf', size: '145000', originalKey: 'seed/sample-document.pdf', public: false },
  { filename: 'sample-text.txt', contentType: 'text/plain', size: '1200', originalKey: 'seed/sample-text.txt', public: false },
  { filename: 'sample-photo.jpg', contentType: 'image/jpeg', size: '89000', originalKey: 'seed/sample-photo.jpg', public: true },
  { filename: 'sample-spreadsheet.csv', contentType: 'text/csv', size: '3400', originalKey: 'seed/sample-spreadsheet.csv', public: false },
];

const isAttachmentSeeded = async () => {
  if (!db) return true;
  const rows = await db.select().from(attachmentsTable).limit(1);
  return rows.length > 0;
};

/**
 * Seeds the database with attachment records for each seeded organization.
 * Records reference pre-existing files in the dev S3 bucket under `seed/`.
 */
export const attachmentsSeed = async () => {
  const spinner = startSpinner('Seeding attachments...');

  if (!db) {
    spinner.fail('DATABASE_ADMIN_URL required for seeding');
    return;
  }

  if (await isAttachmentSeeded()) {
    warnSpinner('Attachments table not empty → skip seeding');
    return;
  }

  // Fetch all seeded organizations (need tenantId + id for FK constraints)
  const organizations = await db.select({ id: organizationsTable.id, tenantId: organizationsTable.tenantId }).from(organizationsTable);

  if (!organizations.length) {
    spinner.fail('No organizations found → run organization seed first');
    return;
  }

  let totalCreated = 0;

  for (const org of organizations) {
    const records = SEED_FILES.map((file, i) => {
      const base = mockAttachment(`attachment:seed:${org.id}:${i}`);
      return {
        ...base,
        tenantId: org.tenantId,
        organizationId: org.id,
        createdBy: defaultAdminUser.id,
        modifiedBy: defaultAdminUser.id,
        filename: file.filename,
        name: file.filename,
        contentType: file.contentType,
        size: file.size,
        originalKey: file.originalKey,
        public: file.public,
        bucketName: file.public ? appConfig.s3.publicBucket : appConfig.s3.privateBucket,
      };
    });

    await db.insert(attachmentsTable).values(records).onConflictDoNothing();
    totalCreated += records.length;
  }

  succeedSpinner(`Created ${totalCreated} attachments across ${organizations.length} organizations`);
};

export const seedConfig: SeedScript = { name: 'attachments', run: attachmentsSeed };
