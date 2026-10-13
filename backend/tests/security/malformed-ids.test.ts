import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminRole, defaultHeaders } from '../fixtures';
import { createTestOrganization, expectRefusal } from '../helpers';
import { createAppClient } from '../test-client';
import { setTestConfig } from '../test-utils';
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
    organization = await createTestOrganization();
    member = await createOrgUser(call, organization.tenantId, organization.id, 'malformed-id-member', adminRole);
  });

  afterAll(async () => await clearSecurityTestData());

  it('must not reveal the failed query via a malformed organization id', async () => {
    const { status, text } = await get(`/${organization.tenantId}/not-a-uuid/attachments`);
    await expectRefusal({ status, body: JSON.parse(text) }, 400, 'invalid_request');
    expect(text.toLowerCase()).not.toMatch(/select|invalid input syntax|from "/);
  });

  it('must not reveal the failed query via a malformed entity id', async () => {
    const { status, text } = await get(`/${organization.tenantId}/${organization.id}/attachments/not-a-uuid`);
    expect(status).toBe(400);
    expect(text.toLowerCase()).not.toMatch(/select|invalid input syntax|from "/);
  });

  // Postgres takes a NUL character in no text value and refuses the query itself (SQLSTATE 22021).
  it('must not answer a server error for a NUL character in an id of a path', async () => {
    const nul = encodeURIComponent('x\u0000y');
    const paths = [
      `/${organization.tenantId}/${nul}/attachments`,
      `/${organization.tenantId}/${organization.id}/attachments/${nul}`,
      `/${nul}/${organization.id}/attachments`,
      `/${organization.tenantId}/organizations/${nul}?slug=true`,
    ];
    for (const path of paths) {
      const { status, text } = await get(path);
      expect(status, path).toBe(400);
      expect(text.toLowerCase(), path).not.toMatch(/select|invalid byte sequence|from "/);
    }
  });

  it('must not answer a server error for a NUL character in an id of a delete batch or in a written value', async () => {
    const send = (method: string, path: string, body: unknown) =>
      baseApp.request(`/${organization.tenantId}/${path}`, {
        method,
        headers: { ...defaultHeaders, Cookie: member.sessionCookie },
        body: JSON.stringify(body),
      });

    const batch = await send('DELETE', `${organization.id}/attachments`, { ids: ['x\u0000y'] });
    expect(batch.status).toBe(400);

    const written = await send('PUT', `organizations/${organization.id}`, { name: 'Named\u0000' });
    expect(written.status).toBe(400);
  });

  it('answers a well-formed id that names nothing with 404 (positive control)', async () => {
    const { status } = await get(`/${organization.tenantId}/${organization.id}/attachments/00000000-0000-4000-8000-000000000000`);
    expect(status).toBe(404);
  });
});
