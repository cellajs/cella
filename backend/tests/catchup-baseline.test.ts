import { sql } from 'drizzle-orm';
import { postAppCatchup } from 'sdk';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { channelCountersTable } from '#/modules/entities/channel-counters-db';
import type { AppCatchupResponse } from '#/schemas';
import { defaultHeaders } from './fixtures';
import { clearSecurityTestData, createTestTenant, type TestTenant } from './security/helpers';
import { createAppClient } from './test-client';
import { mockFetchRequest, setTestConfig } from './test-utils';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

// Verifies the view-driven catchup contract end-to-end (sequence sync): membership
// screening via changes.signals, product sync via per-view f:/e: answers.
describe('Catchup (view-driven, sequence)', async () => {
  const call = await createAppClient();
  let tenant: TestTenant;

  beforeAll(async () => {
    mockFetchRequest();
    tenant = await createTestTenant(call, 'catchup-baseline');

    // Seed channel_counters with sequence, frontier and count values for the org
    const counts = {
      sequence: 50,
      membership: 3,
      'e:f:attachment': 42,
      'e:c:attachment': 15,
      'e:f:h:attachment': 40,
      'e:c:h:attachment': 12,
      'm:c:admin': 1,
    };
    await db
      .insert(channelCountersTable)
      .values({ channelKey: tenant.organization.id, counts, path: tenant.organization.id })
      .onConflictDoUpdate({
        target: channelCountersTable.channelKey,
        set: { counts, path: tenant.organization.id },
      });
  });

  afterAll(async () => {
    await db.delete(channelCountersTable).where(sql`channel_key = ${tenant.organization.id}`);
    await clearSecurityTestData();
  });

  it('returns the membership change signal without cursor (baseline)', async () => {
    const result = await call(postAppCatchup, {
      body: {},
      headers: { ...defaultHeaders, Cookie: tenant.sessionCookie },
    });

    expect(result.response.status).toBe(200);
    const { changes, cursor } = result.data as AppCatchupResponse;

    const orgChanges = changes[tenant.organization.id];
    expect(orgChanges).toBeDefined();
    expect(orgChanges.signals!.membership).toBe(3);
    // The org sequence value itself is not exposed on the wire (clients never read it).
    expect(orgChanges).not.toHaveProperty('entitySeqs');
    expect(cursor).toBeDefined();
  });

  it('answers an org view with frontier and count rollups (org member, unconditional read)', async () => {
    const orgId = tenant.organization.id;
    const result = await call(postAppCatchup, {
      body: {
        cursor: '0-0',
        views: [
          {
            key: `${orgId}:attachment`,
            organizationId: orgId,
            prefixes: [orgId],
            entityTypes: ['attachment'],
            cursor: 40,
          },
        ],
      },
      headers: { ...defaultHeaders, Cookie: tenant.sessionCookie },
    });

    expect(result.response.status).toBe(200);
    const { views } = result.data as AppCatchupResponse;
    expect(views).toBeDefined();
    expect(views).toHaveLength(1);
    const [answer] = views!;
    expect(answer.key).toBe(`${orgId}:attachment`);
    expect(answer.status).toBe('ok');
    expect(answer.frontiers).toEqual({ attachment: 42 });
    expect(answer.counts).toEqual({ attachment: 15 });
  });

  it('answers a SELF view from the fs:/es: family', async () => {
    const orgId = tenant.organization.id;
    const result = await call(postAppCatchup, {
      body: {
        cursor: '0-0',
        views: [
          {
            key: `${orgId}:attachment:self`,
            organizationId: orgId,
            prefixes: [orgId],
            entityTypes: ['attachment'],
            depth: 'self',
            cursor: 39,
          },
        ],
      },
      headers: { ...defaultHeaders, Cookie: tenant.sessionCookie },
    });

    expect(result.response.status).toBe(200);
    const { views } = result.data as AppCatchupResponse;
    expect(views).toHaveLength(1);
    expect(views![0]).toMatchObject({
      key: `${orgId}:attachment:self`,
      status: 'ok',
      frontiers: { attachment: 40 },
      counts: { attachment: 12 },
    });
  });

  it('a claimed prefix that mismatches the verified path answers opaque, no numbers', async () => {
    const orgId = tenant.organization.id;
    const result = await call(postAppCatchup, {
      body: {
        cursor: '0-0',
        views: [
          {
            // Node id is the org (counters row exists, path = orgId), but the claim
            // dresses it up as a deeper node: verified path !== claim → opaque.
            key: 'forged',
            organizationId: orgId,
            prefixes: [`${orgId}/fake-course/${orgId}`],
            entityTypes: ['attachment'],
            cursor: 0,
          },
        ],
      },
      headers: { ...defaultHeaders, Cookie: tenant.sessionCookie },
    });

    expect(result.response.status).toBe(200);
    const { views } = result.data as AppCatchupResponse;
    expect(views![0]).toEqual({ key: 'forged', status: 'opaque' });
  });

  it('answers a view on an org the caller is no part of, without leaking numbers', async () => {
    const orgId = tenant.organization.id;
    const result = await call(postAppCatchup, {
      body: {
        cursor: '0-0',
        views: [
          {
            key: 'other:attachment',
            organizationId: 'a0000000-0000-4000-a000-000000000001',
            prefixes: ['a0000000-0000-4000-a000-000000000001'],
            entityTypes: ['attachment'],
            cursor: 0,
          },
          {
            key: `${orgId}:attachment`,
            organizationId: orgId,
            prefixes: [orgId],
            entityTypes: ['attachment'],
            cursor: 42,
          },
        ],
      },
      headers: { ...defaultHeaders, Cookie: tenant.sessionCookie },
    });

    expect(result.response.status).toBe(200);
    const { views } = result.data as AppCatchupResponse;
    // The other org's exact non-'ok' status is fork-dependent: 'forbidden' with no public read
    // route, 'opaque' when a publicRead() grant means a readable row can exist there. The
    // guarantee both forks share is what this test asserts: not 'ok', and no numbers leaked.
    expect(views!.map((v) => v.key)).toEqual(['other:attachment', `${orgId}:attachment`]);
    expect(views![0].status).not.toBe('ok');
    expect(views![1].status).toBe('ok');
    expect(views![0].frontiers).toBeUndefined();
    expect(views![0].counts).toBeUndefined();
  });
});
