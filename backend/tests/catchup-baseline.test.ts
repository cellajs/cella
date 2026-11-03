import { inArray } from 'drizzle-orm';
import { postAppCatchup } from 'sdk';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { channelCountersTable } from '#/modules/entities/channel-counters-db';
import type { AppCatchupResponse } from '#/schemas';
import { defaultHeaders } from './fixtures';
import { createTestOrganization } from './helpers';
import { clearSecurityTestData, createTestTenant, type TestTenant } from './security/helpers';
import { createAppClient } from './test-client';
import { setTestConfig } from './test-utils';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

// Verifies the view-driven catchup contract end-to-end (sequence sync): signal versions
// via organizations.signals, product sync via a frontier answer per organization view.
describe('Catchup (view-driven, sequence)', async () => {
  const call = await createAppClient();
  let tenant: TestTenant;
  /** An organization in another tenant, with numbers of its own, that the caller has no part in. */
  let otherOrgId: string;

  beforeAll(async () => {
    tenant = await createTestTenant(call, 'catchup-baseline');
    otherOrgId = (await createTestOrganization()).id;
    await db.insert(channelCountersTable).values({ channelKey: otherOrgId, counts: { sequence: 9, 'e:f:attachment': 7, 'e:c:attachment': 3 } });

    const counts = {
      sequence: 50,
      's:membership.changed': 3,
      's:channel.deleted': 2,
      'e:f:attachment': 42,
      'e:c:attachment': 15,
      'e:c:h:attachment': 12,
      'm:c:admin': 1,
    };
    await db
      .insert(channelCountersTable)
      .values({ channelKey: tenant.organization.id, counts })
      .onConflictDoUpdate({ target: channelCountersTable.channelKey, set: { counts } });
  });

  afterAll(async () => {
    await db.delete(channelCountersTable).where(inArray(channelCountersTable.channelKey, [tenant.organization.id, otherOrgId]));
    await clearSecurityTestData();
  });

  it('returns the version of each versioned signal by its type, also to a body without views', async () => {
    const result = await call(postAppCatchup, { body: {}, headers: { ...defaultHeaders, Cookie: tenant.sessionCookie } });

    expect(result.response.status).toBe(200);
    const { organizations } = result.data as AppCatchupResponse;

    const summary = organizations[tenant.organization.id];
    expect(summary).toBeDefined();
    // Keyed by signal type, so the client's catchup and an app's handler read the same key.
    expect(summary.signals).toEqual({ 'membership.changed': 3, 'channel.deleted': 2 });
    // The org sequence value itself is not exposed on the wire (clients never read it).
    expect(summary).not.toHaveProperty('entitySeqs');
  });

  it('answers an org view with its frontier (org member, unconditional read)', async () => {
    const orgId = tenant.organization.id;
    const result = await call(postAppCatchup, {
      body: { views: [{ organizationId: orgId, entityType: 'attachment', cursor: 40 }] },
      headers: { ...defaultHeaders, Cookie: tenant.sessionCookie },
    });

    expect(result.response.status).toBe(200);
    const { views } = result.data as AppCatchupResponse;
    expect(views).toEqual([{ organizationId: orgId, entityType: 'attachment', status: 'ok', frontier: 42 }]);
  });

  it('answers a view on an org the caller is no part of, without leaking numbers', async () => {
    const orgId = tenant.organization.id;
    const result = await call(postAppCatchup, {
      body: {
        views: [
          { organizationId: otherOrgId, entityType: 'attachment', cursor: 0 },
          { organizationId: orgId, entityType: 'attachment', cursor: 42 },
        ],
      },
      headers: { ...defaultHeaders, Cookie: tenant.sessionCookie },
    });

    expect(result.response.status).toBe(200);
    const { views } = result.data as AppCatchupResponse;
    // The exact non-'ok' status is app-dependent; the shared guarantee is: not 'ok', no numbers.
    expect(views!.map((v) => v.organizationId)).toEqual([otherOrgId, orgId]);
    expect(views![0].status).not.toBe('ok');
    expect(views![1].status).toBe('ok');
    expect(views![0].frontier).toBeUndefined();
  });
});
