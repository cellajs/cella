import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { defaultHeaders } from '../fixtures';
import { createTestOrganization, type ErrorResponse } from '../helpers';
import { createAppClient } from '../test-client';
import { mockFetchRequest, setTestConfig } from '../test-utils';
import { clearSecurityTestData, createOrgUser } from './helpers';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

/**
 * Ids in a path reach guards and queries before any schema checks them. A value Postgres cannot read as its column type
 * is the caller's mistake: it answers 400 with the app's own message, never a server error carrying the failed SQL.
 */
describe('Malformed ids in a path', async () => {
  const call = await createAppClient();
  const { baseApp } = await import('#/routes');
  let member: { sessionCookie: string };
  let organization: { id: string; tenantId: string };

  const get = async (path: string) => {
    const response = await baseApp.request(path, { headers: { ...defaultHeaders, Cookie: member.sessionCookie } });
    return { status: response.status, text: await response.text() };
  };

  beforeAll(async () => {
    mockFetchRequest();
    organization = await createTestOrganization();
    member = await createOrgUser(call, organization.tenantId, organization.id, 'malformed-id-member');
  });

  afterAll(async () => await clearSecurityTestData());

  it('must not reveal the failed query via a malformed organization id', async () => {
    const { status, text } = await get(`/${organization.tenantId}/not-a-uuid/attachments`);
    expect(status).toBe(400);
    expect((JSON.parse(text) as ErrorResponse).type).toBe('invalid_request');
    expect(text.toLowerCase()).not.toMatch(/select|invalid input syntax|from "/);
  });

  it('must not reveal the failed query via a malformed entity id', async () => {
    const { status, text } = await get(`/${organization.tenantId}/${organization.id}/attachments/not-a-uuid`);
    expect(status).toBe(400);
    expect(text.toLowerCase()).not.toMatch(/select|invalid input syntax|from "/);
  });

  it('answers a well-formed id that names nothing with 404 (positive control)', async () => {
    const { status } = await get(
      `/${organization.tenantId}/${organization.id}/attachments/00000000-0000-4000-8000-000000000000`,
    );
    expect(status).toBe(404);
  });
});
