import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getAdminDb } from '#/db/db';
import { mockPastIsoDate } from '#/mocks';
import { systemRolesTable } from '#/modules/system/system-roles-db';
import { defaultHeaders } from '../fixtures';
import { createTestOrganization, type ErrorResponse } from '../helpers';
import { createAppClient } from '../test-client';
import { mockFetchRequest, setTestConfig } from '../test-utils';
import { clearSecurityTestData, createOrgUser } from './helpers';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

type UserRow = { id: string; role?: string | null };

/**
 * The user list reaches every user sharing an organization with the caller. Which of them holds a system role is a
 * system admin's to know: shown to anyone else, as a field, a filter or a sort, it lists the system admins.
 */
describe('System roles in the user list', async () => {
  const call = await createAppClient();
  const { baseApp } = await import('#/routes');
  let member: { id: string; sessionCookie: string };
  let sysAdmin: { id: string; sessionCookie: string };

  /** Raw JSON: the SDK's response parsing would hide a field the schema no longer declares. */
  const listUsers = async (as: { sessionCookie: string }, query: Record<string, string> = {}) => {
    const response = await baseApp.request(`/users/users?${new URLSearchParams(query)}`, {
      headers: { ...defaultHeaders, Cookie: as.sessionCookie },
    });
    return { status: response.status, body: (await response.json()) as { items: UserRow[] } & ErrorResponse };
  };

  beforeAll(async () => {
    mockFetchRequest();
    const organization = await createTestOrganization();
    member = await createOrgUser(call, organization.tenantId, organization.id, 'role-list-member');
    // A system admin who is also a member here, so the member's list includes them.
    sysAdmin = await createOrgUser(call, organization.tenantId, organization.id, 'role-list-sysadmin');
    await getAdminDb('test setup')
      .insert(systemRolesTable)
      .values({ userId: sysAdmin.id, role: 'admin', createdAt: mockPastIsoDate() });
  });

  afterAll(async () => await clearSecurityTestData());

  it('must not reveal system admins via the role field of getUsers', async () => {
    const { status, body } = await listUsers(member);
    expect(status).toBe(200);
    expect(body.items.map((user) => user.id)).toContain(sysAdmin.id);
    for (const user of body.items) expect(user).not.toHaveProperty('role');
  });

  it('must not list system admins via the role filter or sort of getUsers', async () => {
    const queries: Record<string, string>[] = [{ role: 'admin' }, { sort: 'role', order: 'desc' }];
    for (const query of queries) {
      const { status, body } = await listUsers(member, query);
      expect(status, JSON.stringify(query)).toBe(403);
      expect(body.type).toBe('forbidden');
      expect(body).not.toHaveProperty('items');
    }
  });

  it('returns, filters and sorts by the system role for a system admin (positive control)', async () => {
    const all = await listUsers(sysAdmin);
    expect(all.status).toBe(200);
    const roleOf = (id: string) => all.body.items.find((user) => user.id === id)?.role;
    expect(roleOf(sysAdmin.id)).toBe('admin');
    expect(roleOf(member.id)).toBeNull();

    const admins = await listUsers(sysAdmin, { role: 'admin' });
    expect(admins.status).toBe(200);
    expect(admins.body.items.map((user) => user.id)).toEqual([sysAdmin.id]);

    const sorted = await listUsers(sysAdmin, { sort: 'role', order: 'asc' });
    expect(sorted.status).toBe(200);
    expect(sorted.body.items[0]?.id).toBe(sysAdmin.id);
  });
});
