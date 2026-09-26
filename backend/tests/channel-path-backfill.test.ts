import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { eq, inArray, sql } from 'drizzle-orm';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getAdminDb } from '#/db/db';
import { channelCountersTable } from '#/modules/entities/channel-counters-db';
import { sideEffect } from '../scripts/migrations/20-channel-path-backfill.migration';
import { createTestOrganization } from './helpers';
import { clearSecurityTestData } from './security/helpers';

const drizzleDir = join(import.meta.dirname, '../drizzle');

/**
 * Catch-up proves a node's ancestry from its counters row's canonical path, and without one proves only the node id,
 * so org-wide readers get no frontiers for it. Counters rows written before CDC kept paths hold NULL, and nothing
 * rewrote them: a side-effect migration backfills every channel's path at deploy.
 */
describe('channel path backfill', () => {
  const adminDb = getAdminDb('channel path backfill test');
  const stray = generateId();
  let organization: Awaited<ReturnType<typeof createTestOrganization>>;

  beforeAll(async () => {
    organization = await createTestOrganization();
  });

  afterAll(async () => {
    await adminDb
      .delete(channelCountersTable)
      .where(inArray(channelCountersTable.channelKey, [organization.id, stray]));
    await clearSecurityTestData();
  });

  const pathOf = async (channelKey: string) => {
    const [row] = await adminDb
      .select({ path: channelCountersTable.path })
      .from(channelCountersTable)
      .where(eq(channelCountersTable.channelKey, channelKey));
    return row?.path;
  };

  it("must not leave an existing channel's counters row without its canonical path", async () => {
    // Rows as the counters upsert wrote them before CDC kept paths: one for the organization, one for no channel.
    await adminDb
      .insert(channelCountersTable)
      .values([
        { channelKey: organization.id, counts: {}, path: null },
        { channelKey: stray, counts: {}, path: null },
      ])
      .onConflictDoUpdate({ target: channelCountersTable.channelKey, set: { path: null } });

    const block = await sideEffect.produce();
    await adminDb.execute(sql.raw(block.sql));

    expect(organization.path).toBeTruthy();
    expect(await pathOf(organization.id)).toBe(organization.path);
    // A row whose channel does not exist proves nothing and stays without a path.
    expect(await pathOf(stray)).toBeNull();
  });

  it('ships in the side-effect migration a deploy applies', () => {
    const folders = readdirSync(drizzleDir)
      .filter((name) => name.endsWith('_side_effects'))
      .sort();
    const latest = readFileSync(join(drizzleDir, folders.at(-1) ?? '', 'migration.sql'), 'utf8');
    expect(latest).toContain('[channel_path_backfill]');
    expect(latest).toContain('UPDATE channel_counters cc SET path = c.path');
  });
});
