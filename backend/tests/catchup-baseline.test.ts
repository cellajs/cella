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

// Verifies the view-driven catchup contract end-to-end (ledger sync): membership
// screening via changes.entitySeqs, product sync via per-view hw:/e: answers.
describe('Catchup (view-driven, ledger)', async () => {
  const call = await createAppClient();
  let tenant: TestTenant;

  beforeAll(async () => {
    mockFetchRequest();
    tenant = await createTestTenant(call, 'catchup-baseline');

    // Seed channel_counters with ledger, hw and count values for the org
    const counts = {
      's:ledger': 50,
      's:membership': 3,
      'hw:attachment': 42,
      'e:attachment': 15,
      'hws:attachment': 40,
      'es:attachment': 12,
      'm:admin': 1,
    };
    await db
      .insert(channelCountersTable)
      .values({ channelKey: tenant.organization.id, counts })
      .onConflictDoUpdate({ target: channelCountersTable.channelKey, set: { counts } });
  });

  afterAll(async () => {
    await db.delete(channelCountersTable).where(sql`channel_key = ${tenant.organization.id}`);
    await clearSecurityTestData();
  });

  it('returns membership screening seqs without cursor (baseline)', async () => {
    const result = await call(postAppCatchup, {
      body: {},
      headers: { ...defaultHeaders, Cookie: tenant.sessionCookie },
    });

    expect(result.response.status).toBe(200);
    const { changes, cursor } = result.data as AppCatchupResponse;

    const orgChanges = changes[tenant.organization.id];
    expect(orgChanges).toBeDefined();
    expect(orgChanges.entitySeqs!.membership).toBe(3);
    expect(orgChanges.entitySeqs!.ledger).toBe(50);
    expect(cursor).toBeDefined();
  });

  it('answers an org view with hw and count rollups (org member, unconditional read)', async () => {
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
    expect(answer.highWaters).toEqual({ attachment: 42 });
    expect(answer.counts).toEqual({ attachment: 15 });
  });

  it('answers a SELF view from the hws:/es: family', async () => {
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
      highWaters: { attachment: 40 },
      counts: { attachment: 12 },
    });
  });

  it('forbids a view on an org the caller is no part of, without leaking numbers', async () => {
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
    expect(views!.map((v) => [v.key, v.status])).toEqual([
      ['other:attachment', 'forbidden'],
      [`${orgId}:attachment`, 'ok'],
    ]);
    expect(views![0].highWaters).toBeUndefined();
    expect(views![0].counts).toBeUndefined();
  });
});
