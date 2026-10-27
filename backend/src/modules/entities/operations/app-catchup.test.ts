import { sql } from 'drizzle-orm';
import { appConfig } from 'shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { baseDb, getSeedDb } from '#/db/db';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import { answerCatchupViews } from './app-catchup';

const seedDb = getSeedDb();
const ctx = { var: { db: baseDb } };

/** Authorization via resolveViewReadStatus, summaries from channel_counters f:/e: rollups. */

const org = 'org-catchup-test';
const otherOrg = 'org-catchup-other';
const [productType] = appConfig.productEntityTypes;

const orgAdmin: MembershipBaseModel[] = [
  { id: 'mem-1', userId: 'actor', channelType: 'organization', channelId: org, organizationId: org, role: 'admin' } as unknown as MembershipBaseModel,
];

// A node below org whose counters row carries its verified path.
const child = 'node-catchup-child';

beforeAll(async () => {
  await seedDb.execute(
    sql.raw(`
      INSERT INTO channel_counters (channel_key, counts, path, updated_at)
      VALUES
        ('${org}', '{"sequence": 40, "e:f:${productType}": 37, "e:c:${productType}": 12}'::jsonb, NULL, NOW()),
        -- Another organization's row as CDC left it at runtime: counts but no path.
        ('${otherOrg}', '{"sequence": 90, "e:f:${productType}": 88, "e:c:${productType}": 7}'::jsonb, NULL, NOW()),
        ('${child}', '{"e:f:${productType}": 21, "e:c:${productType}": 3}'::jsonb, '${org}/${child}', NOW())
      ON CONFLICT (channel_key) DO UPDATE SET counts = EXCLUDED.counts, path = EXCLUDED.path
    `),
  );
});

afterAll(async () => {
  await seedDb.execute(sql.raw(`DELETE FROM channel_counters WHERE channel_key IN ('${org}', '${otherOrg}', '${child}')`));
});

describe('answerCatchupViews', () => {
  it('answers an authorized org view with frontier/count summaries', async () => {
    const answers = await answerCatchupViews(ctx, orgAdmin, { actorId: 'actor', isSystemAdmin: false, scopes: null }, [
      { key: 'v1', organizationId: org, prefixes: [org], entityTypes: [productType], cursor: 30 },
    ]);

    expect(answers).toEqual([{ key: 'v1', status: 'ok', frontiers: { [productType]: 37 }, counts: { [productType]: 12 } }]);
  });

  it('answers a view outside the caller memberships without leaking numbers', async () => {
    // The exact non-'ok' status is app-dependent; the shared guarantee is: not 'ok', no numbers.
    const answers = await answerCatchupViews(ctx, orgAdmin, { actorId: 'actor', isSystemAdmin: false, scopes: null }, [
      { key: 'v2', organizationId: otherOrg, prefixes: [otherOrg], entityTypes: [productType], cursor: 0 },
    ]);

    expect(answers).toHaveLength(1);
    expect(answers[0].key).toBe('v2');
    expect(answers[0].status).not.toBe('ok');
    expect(answers[0].frontiers).toBeUndefined();
    expect(answers[0].counts).toBeUndefined();
  });

  it('a mixed request answers each view independently', async () => {
    const answers = await answerCatchupViews(ctx, orgAdmin, { actorId: 'actor', isSystemAdmin: false, scopes: null }, [
      { key: 'a', organizationId: org, prefixes: [org], entityTypes: [productType], cursor: 37 },
      { key: 'b', organizationId: otherOrg, prefixes: [otherOrg], entityTypes: [productType], cursor: 5 },
    ]);

    // View 'a' is the caller's own org, view 'b' a non-member org.
    expect(answers.map((a) => a.key)).toEqual(['a', 'b']);
    expect(answers[0].status).toBe('ok');
    expect(answers[1].status).not.toBe('ok');
  });

  it('a forged prefix pointing at another org is forbidden even with real memberships', async () => {
    const answers = await answerCatchupViews(ctx, orgAdmin, { actorId: 'actor', isSystemAdmin: false, scopes: null }, [
      { key: 'v3', organizationId: org, prefixes: [`${otherOrg}/x`], entityTypes: [productType], cursor: 0 },
    ]);

    expect(answers).toEqual([{ key: 'v3', status: 'forbidden' }]);
  });

  it("must not read another org's frontiers via a forged prefix on a counters row without a path", async () => {
    const answers = await answerCatchupViews(ctx, orgAdmin, { actorId: 'actor', isSystemAdmin: false, scopes: null }, [
      { key: 'v4', organizationId: org, prefixes: [`${org}/${otherOrg}`], entityTypes: [productType], cursor: 0 },
    ]);

    expect(answers).toEqual([{ key: 'v4', status: 'opaque' }]);
  });

  it('answers a deeper node whose verified path lies in the org (positive control)', async () => {
    const answers = await answerCatchupViews(ctx, orgAdmin, { actorId: 'actor', isSystemAdmin: false, scopes: null }, [
      { key: 'v5', organizationId: org, prefixes: [`${org}/${child}`], entityTypes: [productType], cursor: 0 },
    ]);

    expect(answers).toEqual([{ key: 'v5', status: 'ok', frontiers: { [productType]: 21 }, counts: { [productType]: 3 } }]);
  });

  it('returns empty for no views', async () => {
    expect(await answerCatchupViews(ctx, orgAdmin, { actorId: 'actor', isSystemAdmin: false, scopes: null }, [])).toEqual([]);
  });
});
