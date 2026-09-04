import type { SeedScript } from '../types';
import { faker } from '@faker-js/faker';
import { appConfig } from 'shared';
import { startSpinner, succeedSpinner, warnSpinner } from '#/utils/console';
import { getSeedDb } from '#/db/db';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { seedAttachmentPlacements } from '#/modules/attachment/helpers/attachment-placement';
import { organizationsTable } from '#/modules/organization/organization-db';
import { mockStx, mockUuid, setMockContext, withFakerSeed } from '#/mocks';
import { defaultAdminUser } from '../fixtures';
import { seedAssets } from './seed-assets';

// Seed scripts use admin connection for privileged operations
const db = getSeedDb();

// Set mock context for seed script - UUIDs get '00000000-' prefix, nanoids get 'gen-' prefix
setMockContext('script');

const isAttachmentSeeded = async () => {
  const rows = await db.select().from(attachmentsTable).limit(1);
  return rows.length > 0;
};

/** Anonymous HEAD on the first asset; a warning only, so an offline seed still completes. */
const warnWhenAssetsUnreachable = async () => {
  const key = seedAssets[0]?.keys.original;
  if (!key) return;
  const url = `${appConfig.s3.publicCDNUrl}/${key}`;
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(3000) });
    if (!res.ok) warnSpinner(`Seed assets not reachable (HTTP ${res.status} on ${url}); run pnpm seed:assets --check`);
  } catch {
    warnSpinner(`Seed assets not reachable (${url}); attachments will not render until the bucket is`);
  }
};

/**
 * Seeds attachment rows for each placement the seam returns (one per organization by default),
 * one row per published seed asset. Every row is a public-bucket row, so it renders in any
 * development environment without S3 credentials.
 */
export const attachmentsSeed = async () => {
  const spinner = startSpinner('Seeding attachments...');

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

  // Placement seam: apps home the seeded rows on their own channels, or return none to skip.
  const placements = await seedAttachmentPlacements(db, organizations);
  if (!placements.length) {
    warnSpinner('No attachment placements from the placement seam → skip seeding');
    return;
  }

  await warnWhenAssetsUnreachable();

  let totalCreated = 0;

  for (const { organizationId, tenantId, placement } of placements) {
    const records = seedAssets.map((asset, i) =>
      withFakerSeed(`attachment:seed:${organizationId}:${Object.values(placement).join(':')}:${i}`, () => {
        const createdAt = faker.date.recent({ days: 30 }).toISOString();
        const extIndex = asset.filename.lastIndexOf('.');
        return {
          id: mockUuid(),
          entityType: 'attachment' as const,
          tenantId,
          organizationId,
          ...placement,
          createdAt,
          updatedAt: createdAt,
          createdBy: defaultAdminUser.id,
          updatedBy: defaultAdminUser.id,
          stx: mockStx(),
          description: null,
          keywords: faker.lorem.words(3),
          filename: asset.filename,
          name: extIndex > 0 ? asset.filename.slice(0, extIndex) : asset.filename,
          contentType: asset.contentType,
          convertedContentType: asset.convertedContentType,
          size: asset.size,
          keys: asset.keys,
          publicBucket: true,
          bucketName: appConfig.s3.publicBucket,
        };
      }),
    );

    await db.insert(attachmentsTable).values(records).onConflictDoNothing();
    totalCreated += records.length;
  }

  succeedSpinner(`Created ${totalCreated} attachments across ${placements.length} placements`);
};

export const seedConfig: SeedScript = { name: 'attachments', run: attachmentsSeed };
