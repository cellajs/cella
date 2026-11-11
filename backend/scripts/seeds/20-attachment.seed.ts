import { faker } from '@faker-js/faker';
import { appConfig } from 'shared';
import { deriveDocument } from 'shared/utils/derive-description-core';
import { getSeedDb } from '#/db/db';
import { mockStx, mockUuid, setMockContext, withFakerSeed } from '#/mocks';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { type AttachmentSeedPlacement, seedAttachmentPlacements } from '#/modules/attachment/attachment-placement';
import { organizationsTable } from '#/modules/organization/organization-db';
import { noteSpinnerWarning, startSpinner, succeedSpinner, warnSpinner } from '#/utils/console';
import { defaultAdminUser } from '../fixtures';
import type { SeedScript } from '../types';
import { textDocument } from './description-document';
import { type SeedAsset, seedAssets } from './seed-assets';

// Seed scripts use admin connection for privileged operations
const db = getSeedDb();

// Set mock context for seed script - UUIDs get '00000000-' prefix, nanoids get 'gen-' prefix
setMockContext('script');

/**
 * Stored descriptions by seed filename, one paragraph per string. Assets missing here seed with a
 * null description on purpose, so both the empty and the filled editor states are seeded.
 */
const seedDescriptions: Record<string, string[]> = {
  'cella-members.csv': [
    'Member export from the organization settings page, used to check the CSV import round trip.',
    'Columns: name, email, role, joined. The header row is required by the importer.',
  ],
  'cella-notes.txt': ['Release notes draft for the next minor. Keep the plain-text version until the changelog is generated.'],
  'cella-org-page.webp': ['Screenshot of the organization page in the light theme, taken at 1440 px wide.'],
};

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
    if (!res.ok) noteSpinnerWarning(`Seed assets not reachable (HTTP ${res.status} on ${url}); run pnpm seed:assets --check`);
  } catch {
    noteSpinnerWarning(`Seed assets not reachable (${url}); attachments will not render until the bucket is`);
  }
};

/** A public-bucket attachment row for a seed asset, which renders in any development environment without S3 credentials. */
export const seedAttachmentRecord = (
  asset: SeedAsset,
  { tenantId, organizationId, placement }: AttachmentSeedPlacement,
  createdAt: string,
  createdBy: string,
) => {
  const extIndex = asset.filename.lastIndexOf('.');
  const paragraphs = seedDescriptions[asset.filename];
  const description = paragraphs ? textDocument(...paragraphs) : null;
  return {
    id: mockUuid(),
    entityType: 'attachment' as const,
    tenantId,
    organizationId,
    ...placement,
    createdAt,
    updatedAt: createdAt,
    createdBy,
    updatedBy: createdBy,
    stx: mockStx(),
    description,
    // The update op derives keywords from the document; a row without one keeps filler search text.
    keywords: description ? deriveDocument(description).keywords : faker.lorem.words(3),
    filename: asset.filename,
    name: extIndex > 0 ? asset.filename.slice(0, extIndex) : asset.filename,
    contentType: asset.contentType,
    convertedContentType: asset.convertedContentType,
    size: asset.size,
    keys: asset.keys,
    publicBucket: true,
    bucketName: appConfig.s3.publicBucketName,
  };
};

/**
 * Seeds one attachment row per published seed asset in each organization, dealt round-robin over
 * the placements the seam returns for it (one per organization by default).
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

  // App-owned: an app homes the seeded rows in its own channels, or returns none to skip.
  const placements = await seedAttachmentPlacements(db, organizations);
  if (!placements.length) {
    warnSpinner('No attachment placements from seedAttachmentPlacements → skip seeding');
    return;
  }

  await warnWhenAssetsUnreachable();

  let totalCreated = 0;

  for (const [organizationId, homes] of Map.groupBy(placements, (home) => home.organizationId)) {
    const records = seedAssets.map((asset, i) => {
      const home = homes[i % homes.length];
      return withFakerSeed(`attachment:seed:${organizationId}:${Object.values(home.placement).join(':')}:${i}`, () =>
        seedAttachmentRecord(asset, home, faker.date.recent({ days: 30 }).toISOString(), defaultAdminUser.id),
      );
    });

    await db.insert(attachmentsTable).values(records).onConflictDoNothing();
    totalCreated += records.length;
  }

  succeedSpinner(`Created ${totalCreated} attachments across ${placements.length} placements`);
};

export const seedConfig: SeedScript = { name: 'attachments', run: attachmentsSeed };
