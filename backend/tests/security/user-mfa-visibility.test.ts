import { getMembers, getUser } from 'sdk';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { baseDb as db, getAdminDb } from '#/db/db';
import { mockPastIsoDate } from '#/mocks';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { systemRolesTable } from '#/modules/system/system-roles-db';
import { adminRole, defaultHeaders, memberRole } from '../fixtures';
import { createOrganizationAdminUser, createTestOrganization, createTestSession, enableMFAForUser } from '../helpers';
import { createAppClient } from '../test-client';
import { setTestConfig } from '../test-utils';
import { clearSecurityTestData, createOrgUser } from './helpers';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

type Session = { sessionCookie: string };
type UserRow = { id: string; mfaRequired?: boolean };

/**
 * `getUser` and the members list reach every user sharing an organization with the caller. Whether an account has MFA
 * on is opt-in (`include=mfa`) and for the account itself, system admins and the admins of an organization the user
 * is a member of: shown to any co-member, it lists the accounts without a second factor.
 */
describe('The MFA setting of other users', async () => {
  const call = await createAppClient();
  let organization: { id: string; tenantId: string };
  let target: { id: string; sessionCookie: string };
  let withoutMfa: { id: string; sessionCookie: string };
  let coMember: Session;
  let admin: Session;
  let adminElsewhere: Session;
  let sysAdmin: Session;

  const headers = (as: Session) => ({ ...defaultHeaders, Cookie: as.sessionCookie });

  // `include: null` sends no include at all; a default parameter would turn `undefined` back into 'mfa'.
  const readUser = async (as: Session, id = target.id, include: string | null = 'mfa') => {
    const query = include ? { include } : {};
    const { data, response } = await call(getUser, { path: { relatableUserId: id }, query, headers: headers(as) });
    expect(response.status).toBe(200);
    return data as UserRow;
  };

  const listMembers = async (as: Session, include: string | null = 'mfa') => {
    const { data, response } = await call(getMembers, {
      path: { tenantId: organization.tenantId, organizationId: organization.id },
      query: { entityId: organization.id, entityType: 'organization', ...(include && { include }) },
      headers: headers(as),
    });
    expect(response.status).toBe(200);
    return (data as { items: UserRow[] }).items;
  };

  beforeAll(async () => {
    await clearSecurityTestData();
    organization = await createTestOrganization();
    const { tenantId, id: organizationId } = organization;

    target = await createOrgUser(call, tenantId, organizationId, 'mfa-target');
    await enableMFAForUser(target.id);
    withoutMfa = await createOrgUser(call, tenantId, organizationId, 'mfa-off');
    coMember = await createOrgUser(call, tenantId, organizationId, 'mfa-co-member');
    admin = await createOrgUser(call, tenantId, organizationId, 'mfa-admin', adminRole);

    // A member here who is an admin of another organization, one the target is not in.
    const other = await createTestOrganization();
    const user = await createOrganizationAdminUser('mfa-admin-elsewhere-user@security-test.com', other.id, adminRole, other.tenantId);
    await db.insert(membershipsTable).values({
      id: generateId(),
      userId: user.id,
      channelId: organizationId,
      organizationId,
      tenantId,
      channelType: 'organization',
      role: memberRole,
      displayOrder: 2,
      createdAt: mockPastIsoDate(),
      createdBy: user.id,
    });
    adminElsewhere = { sessionCookie: await createTestSession(user) };

    const sysAdminUser = await createOrgUser(call, tenantId, organizationId, 'mfa-sysadmin');
    await getAdminDb('test setup').insert(systemRolesTable).values({ userId: sysAdminUser.id, role: 'admin', createdAt: mockPastIsoDate() });
    sysAdmin = sysAdminUser;
  });

  afterAll(async () => await clearSecurityTestData());

  describe('on getUser', () => {
    it('must not reveal the MFA setting to a co-member', async () => {
      expect(await readUser(coMember)).not.toHaveProperty('mfaRequired');
    });

    it('must not reveal the MFA setting to an admin of an organization the user is not in', async () => {
      expect(await readUser(adminElsewhere)).not.toHaveProperty('mfaRequired');
    });

    it('returns the MFA setting to an admin of an organization the user is in', async () => {
      expect((await readUser(admin)).mfaRequired).toBe(true);
      expect((await readUser(admin, withoutMfa.id)).mfaRequired).toBe(false);
    });

    it('returns the MFA setting to the user themselves and to a system admin', async () => {
      expect((await readUser(target)).mfaRequired).toBe(true);
      expect((await readUser(withoutMfa, withoutMfa.id)).mfaRequired).toBe(false);
      expect((await readUser(sysAdmin)).mfaRequired).toBe(true);
    });

    it('leaves the MFA setting out unless include=mfa asks for it', async () => {
      expect(await readUser(admin, target.id, null)).not.toHaveProperty('mfaRequired');
      expect(await readUser(target, target.id, null)).not.toHaveProperty('mfaRequired');
    });
  });

  describe('on the members list', () => {
    it('must not reveal the MFA setting to a member, nor to an admin of another organization', async () => {
      for (const caller of [coMember, adminElsewhere]) {
        const members = await listMembers(caller);
        expect(members.map((member) => member.id)).toContain(target.id);
        for (const member of members) expect(member).not.toHaveProperty('mfaRequired');
      }
    });

    it("returns each member's MFA setting to an admin of the organization and to a system admin", async () => {
      for (const caller of [admin, sysAdmin]) {
        const members = await listMembers(caller);
        const mfaOf = (id: string) => members.find((member) => member.id === id)?.mfaRequired;
        expect(mfaOf(target.id)).toBe(true);
        expect(mfaOf(withoutMfa.id)).toBe(false);
      }
    });

    it('leaves the MFA setting out unless include=mfa asks for it', async () => {
      for (const member of await listMembers(admin, null)) expect(member).not.toHaveProperty('mfaRequired');
      for (const member of await listMembers(admin, 'counts')) expect(member).not.toHaveProperty('mfaRequired');
    });
  });
});
