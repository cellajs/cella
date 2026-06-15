/**
 * Catchup baseline integration tests.
 *
 * Verifies that the catchup endpoint returns correct entitySeqs and entityCounts
 * when called without a cursor (baseline mode). This is the foundation for the
 * first-connect flow where catchup seeds the sync store baseline instead of
 * triggering delta-fetches or invalidations.
 *
 * Requires: PostgreSQL (core mode or higher)
 */

import { sql } from 'drizzle-orm';
import { postAppCatchup } from 'sdk';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { contextCountersTable } from '#/modules/entities/context-counters-db';
import type { AppCatchupResponse } from '#/schemas';
import { defaultHeaders } from './fixtures';
import { clearSecurityTestData, createTestTenant, type TestTenant } from './security/helpers';
import { createAppClient } from './test-client';
import { mockFetchRequest, setTestConfig } from './test-utils';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

describe('Catchup baseline', async () => {
  const call = await createAppClient();
  let tenant: TestTenant;

  beforeAll(async () => {
    mockFetchRequest();
    tenant = await createTestTenant(call, 'catchup-baseline');

    // Seed context_counters with known seq and count values for the org
    await db
      .insert(contextCountersTable)
      .values({
        contextKey: tenant.organization.id,
        counts: { 's:task': 42, 's:attachment': 7, 'e:task': 100, 'e:attachment': 15, 'm:admin': 1 },
      })
      .onConflictDoUpdate({
        target: contextCountersTable.contextKey,
        set: { counts: { 's:task': 42, 's:attachment': 7, 'e:task': 100, 'e:attachment': 15, 'm:admin': 1 } },
      });
  });

  afterAll(async () => {
    await db.delete(contextCountersTable).where(sql`context_key = ${tenant.organization.id}`);
    await clearSecurityTestData();
  });

  it('returns entitySeqs and entityCounts without cursor (baseline)', async () => {
    const result = await call(postAppCatchup, {
      body: {},
      headers: { ...defaultHeaders, Cookie: tenant.sessionCookie },
    });

    expect(result.response.status).toBe(200);
    expect(result.data).toBeDefined();

    const { changes, cursor } = result.data as AppCatchupResponse;

    // Should have an entry for the tenant's org
    const orgChanges = changes[tenant.organization.id];
    expect(orgChanges).toBeDefined();

    // Should include entitySeqs (s: keys from context_counters)
    expect(orgChanges.entitySeqs).toBeDefined();
    expect(orgChanges.entitySeqs!.task).toBe(42);
    expect(orgChanges.entitySeqs!.attachment).toBe(7);

    // Should include entityCounts (e: keys from context_counters)
    expect(orgChanges.entityCounts).toBeDefined();
    expect(orgChanges.entityCounts!.task).toBe(100);
    expect(orgChanges.entityCounts!.attachment).toBe(15);

    // Should return a cursor (or null if no activities exist)
    expect(cursor).toBeDefined();
  });

  it('returns empty changes when seqs match (reconnect fast path)', async () => {
    const result = await call(postAppCatchup, {
      body: {
        cursor: '0-0',
        seqs: {
          [`${tenant.organization.id}:s:task`]: 42,
          [`${tenant.organization.id}:s:attachment`]: 7,
        },
      },
      headers: { ...defaultHeaders, Cookie: tenant.sessionCookie },
    });

    expect(result.response.status).toBe(200);
    expect(result.data).toBeDefined();

    const { changes } = result.data as AppCatchupResponse;

    // Org should be pruned — seqs match, no deletes
    expect(changes[tenant.organization.id]).toBeUndefined();
  });

  it('returns org changes when seqs differ (reconnect with delta)', async () => {
    const result = await call(postAppCatchup, {
      body: {
        cursor: '0-0',
        seqs: {
          [`${tenant.organization.id}:s:task`]: 30, // behind server (42)
          [`${tenant.organization.id}:s:attachment`]: 7, // matches
        },
      },
      headers: { ...defaultHeaders, Cookie: tenant.sessionCookie },
    });

    expect(result.response.status).toBe(200);
    expect(result.data).toBeDefined();

    const { changes } = result.data as AppCatchupResponse;

    // Org should be present — task seq differs
    const orgChanges = changes[tenant.organization.id];
    expect(orgChanges).toBeDefined();
    expect(orgChanges.entitySeqs!.task).toBe(42);
  });
});
