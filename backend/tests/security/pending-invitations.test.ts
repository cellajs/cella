import { hierarchy } from 'shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { defaultHeaders } from '../fixtures';
import { createTestOrganization, createTestUser } from '../helpers';
import { createInvitation } from '../invitations/helpers';
import { createAppClient } from '../test-client';
import { mockFetchRequest, setTestConfig } from '../test-utils';
import { clearSecurityTestData, createOrgUser } from './helpers';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

type PendingRow = Record<string, unknown> & { id: string; email: string };

/**
 * Members see who is invited to their organization, as they see every member's address. Resending an invitation
 * needs `update` on the channel, so the invitation's token id is for those callers only, and nobody learns from the
 * list which invited addresses already hold an account.
 */
describe('Pending invitations list', async () => {
  const call = await createAppClient();
  const { baseApp } = await import('#/routes');
  const [adminRole] = hierarchy.getRoles('organization');
  let organization: { id: string; tenantId: string };
  let admin: { id: string; sessionCookie: string };
  let member: { id: string; sessionCookie: string };
  let newcomerTokenId: string;
  let existingUserTokenId: string;

  /** Raw JSON: the SDK's response parsing would hide a field the schema does not declare. */
  const listPending = async (as: { sessionCookie: string }) => {
    const query = new URLSearchParams({ entityId: organization.id, entityType: 'organization' });
    const response = await baseApp.request(
      `/${organization.tenantId}/${organization.id}/memberships/pending?${query}`,
      { headers: { ...defaultHeaders, Cookie: as.sessionCookie } },
    );
    return { status: response.status, items: ((await response.json()) as { items: PendingRow[] }).items };
  };

  beforeAll(async () => {
    mockFetchRequest();
    organization = await createTestOrganization();
    admin = await createOrgUser(call, organization.tenantId, organization.id, 'pending-admin', adminRole);
    member = await createOrgUser(call, organization.tenantId, organization.id, 'pending-member');

    const newcomer = await createInvitation({
      organization,
      email: 'pending-newcomer@security-test.com',
      createdBy: admin.id,
    });
    const existing = await createTestUser('pending-has-account@security-test.com');
    const existingInvite = await createInvitation({
      organization,
      email: existing.email,
      createdBy: admin.id,
      boundTo: existing.id,
    });
    newcomerTokenId = newcomer.token.id;
    existingUserTokenId = existingInvite.token.id;
  });

  afterAll(async () => await clearSecurityTestData());

  it('must not hand invitation token ids to a member via getPendingMemberships', async () => {
    const { status, items } = await listPending(member);
    expect(status).toBe(200);
    // Decision 5: the invitations themselves stay visible to members.
    expect(items.map((item) => item.email).sort()).toEqual([
      'pending-has-account@security-test.com',
      'pending-newcomer@security-test.com',
    ]);
    for (const item of items) expect(item).not.toHaveProperty('tokenId');
  });

  it('must not reveal which invited addresses hold an account via getPendingMemberships', async () => {
    for (const as of [member, admin]) {
      const { items } = await listPending(as);
      for (const item of items) expect(item).not.toHaveProperty('userId');
    }
  });

  it('hands the token ids to a caller who may resend (positive control)', async () => {
    const { status, items } = await listPending(admin);
    expect(status).toBe(200);
    expect(items.map((item) => item.tokenId).sort()).toEqual([newcomerTokenId, existingUserTokenId].sort());
  });
});
