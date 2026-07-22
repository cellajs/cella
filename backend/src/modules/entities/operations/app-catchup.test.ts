import { sql } from 'drizzle-orm';
import { appConfig } from 'shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedDb } from '#/db/db';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import { answerCatchupViews } from './app-catchup';

/**
 * View-driven catchup answers: authorization via resolveViewReadStatus (real app
 * config: organization → attachment), summaries from channel_counters f:/e: rollups.
 */

const ORG = 'org-catchup-test';
const OTHER_ORG = 'org-catchup-other';
const [productType] = appConfig.productEntityTypes;

const orgAdmin: MembershipBaseModel[] = [
  {
    id: 'mem-1',
    userId: 'actor',
    channelType: 'organization',
    channelId: ORG,
    organizationId: ORG,
    role: 'admin',
  } as unknown as MembershipBaseModel,
];

beforeAll(async () => {
  await seedDb.execute(
    sql.raw(`
      INSERT INTO channel_counters (channel_key, counts, updated_at)
      VALUES ('${ORG}', '{"sequence": 40, "e:f:${productType}": 37, "e:c:${productType}": 12}'::jsonb, NOW())
      ON CONFLICT (channel_key) DO UPDATE SET counts = EXCLUDED.counts
    `),
  );
});

afterAll(async () => {
  await seedDb.execute(sql.raw(`DELETE FROM channel_counters WHERE channel_key = '${ORG}'`));
});

describe('answerCatchupViews', () => {
  it('answers an authorized org view with frontier/count summaries', async () => {
    const answers = await answerCatchupViews(orgAdmin, { userId: 'actor', isSystemAdmin: false }, [
      { key: 'v1', organizationId: ORG, prefixes: [ORG], entityTypes: [productType], cursor: 30 },
    ]);

    expect(answers).toEqual([
      { key: 'v1', status: 'ok', frontiers: { [productType]: 37 }, counts: { [productType]: 12 } },
    ]);
  });

  it('answers a view outside the caller memberships without leaking numbers', async () => {
    // The exact non-'ok' status is fork-dependent: 'forbidden' when the product type has no
    // public read route, 'opaque' when a publicRead() grant means a readable row can exist.
    // The guarantee both forks share is what this test asserts: not 'ok', and no numbers.
    const answers = await answerCatchupViews(orgAdmin, { userId: 'actor', isSystemAdmin: false }, [
      { key: 'v2', organizationId: OTHER_ORG, prefixes: [OTHER_ORG], entityTypes: [productType], cursor: 0 },
    ]);

    expect(answers).toHaveLength(1);
    expect(answers[0].key).toBe('v2');
    expect(answers[0].status).not.toBe('ok');
    expect(answers[0].frontiers).toBeUndefined();
    expect(answers[0].counts).toBeUndefined();
  });

  it('a mixed request answers each view independently', async () => {
    const answers = await answerCatchupViews(orgAdmin, { userId: 'actor', isSystemAdmin: false }, [
      { key: 'a', organizationId: ORG, prefixes: [ORG], entityTypes: [productType], cursor: 37 },
      { key: 'b', organizationId: OTHER_ORG, prefixes: [OTHER_ORG], entityTypes: [productType], cursor: 5 },
    ]);

    // View 'a' is the caller's own org (ok); view 'b' is a non-member org, whose exact
    // non-'ok' status is fork-dependent (see the previous test).
    expect(answers.map((a) => a.key)).toEqual(['a', 'b']);
    expect(answers[0].status).toBe('ok');
    expect(answers[1].status).not.toBe('ok');
  });

  it('a forged prefix pointing at another org is forbidden even with real memberships', async () => {
    const answers = await answerCatchupViews(orgAdmin, { userId: 'actor', isSystemAdmin: false }, [
      { key: 'v3', organizationId: ORG, prefixes: [`${OTHER_ORG}/x`], entityTypes: [productType], cursor: 0 },
    ]);

    expect(answers).toEqual([{ key: 'v3', status: 'forbidden' }]);
  });

  it('returns empty for no views', async () => {
    expect(await answerCatchupViews(orgAdmin, { userId: 'actor', isSystemAdmin: false }, [])).toEqual([]);
  });
});
