import { eq } from 'drizzle-orm';
import { getRequests, systemInvite } from 'sdk';
import { afterEach, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { tokensTable } from '#/modules/auth/tokens-db';
import { requestsTable } from '#/modules/requests/requests-db';
import { stampWaitlistRequestInvited } from '#/modules/requests/requests-queries';
import { hashToken } from '#/utils/hash-token';
import { defaultHeaders } from '../fixtures';
import { createSystemAdminUser, createTestSession, createTestUser, mailedLink } from '../helpers';
import { createAppClient } from '../test-client';
import { clearDatabase, setTestConfig } from '../test-utils';

setTestConfig({ enabledAuthStrategies: ['passkey'], selfRegistration: true });

afterEach(async () => await clearDatabase());

describe('System Invitation', async () => {
  const call = await createAppClient();

  async function createAdminSession() {
    const admin = await createSystemAdminUser('admin@example.com');
    return await createTestSession(admin);
  }

  async function makeInviteRequest(emails: string[], sessionCookie: string) {
    return await call(systemInvite, { body: { emails }, headers: { ...defaultHeaders, Cookie: sessionCookie } });
  }

  describe('Basic Functionality', () => {
    it('should invite new users successfully', async () => {
      const sessionCookie = await createAdminSession();
      const { response: res, data } = await makeInviteRequest(['user1@example.com', 'user2@example.com'], sessionCookie);

      expect(res.status).toBe(200);
      const response = data as { data: any[]; rejectedIds: string[]; invitesSentCount: number };
      expect(response.invitesSentCount).toBe(2);
      expect(response.rejectedIds).toHaveLength(0);

      const tokens = await db.select().from(tokensTable).where(eq(tokensTable.type, 'invitation'));
      expect(tokens).toHaveLength(2);
      // The last mail carries the link of one of the minted tokens.
      expect(tokens.map(({ secret }) => secret)).toContain(hashToken(mailedLink('inviteLink').token));
    });

    it('should filter out existing users', async () => {
      await createTestUser('existing@example.com');
      const sessionCookie = await createAdminSession();
      const { response: res, data } = await makeInviteRequest(['existing@example.com', 'newuser@example.com'], sessionCookie);

      expect(res.status).toBe(200);
      const response = data as { data: any[]; rejectedIds: string[]; invitesSentCount: number };
      expect(response.invitesSentCount).toBe(1); // Only new user
      expect(response.rejectedIds).toContain('existing@example.com');
    });

    it('should handle duplicate emails in single request', async () => {
      const sessionCookie = await createAdminSession();
      const { response: res, data } = await makeInviteRequest(['user@example.com', 'user@example.com'], sessionCookie);

      expect(res.status).toBe(200);
      const response = data as { data: any[]; rejectedIds: string[]; invitesSentCount: number };
      expect(response.invitesSentCount).toBe(1); // Only one invitation sent
      expect(response.rejectedIds).toHaveLength(0);
    });
  });

  describe('Waitlist', () => {
    it('marks the waitlist request of an invited address as invited, at its first invitation', async () => {
      const sessionCookie = await createAdminSession();
      await db.insert(requestsTable).values([
        { email: 'waiting@example.com', type: 'waitlist' },
        { email: 'waiting@example.com', type: 'newsletter' },
        { email: 'other@example.com', type: 'waitlist' },
      ]);

      await makeInviteRequest(['waiting@example.com'], sessionCookie);

      const { data } = await call(getRequests, { query: {}, headers: { ...defaultHeaders, Cookie: sessionCookie } });
      const listed = (data as { items: { email: string; type: string; wasInvited: boolean }[] }).items;
      expect(listed.filter(({ wasInvited }) => wasInvited).map(({ email, type }) => ({ email, type }))).toEqual([
        { email: 'waiting@example.com', type: 'waitlist' },
      ]);

      // A later invitation to the address leaves the first time standing.
      const invitedAtOf = async () => (await db.select().from(requestsTable).where(eq(requestsTable.type, 'waitlist'))).map((r) => r.invitedAt);
      const first = await invitedAtOf();
      await stampWaitlistRequestInvited({ var: { db } }, { email: 'waiting@example.com' });
      expect(await invitedAtOf()).toEqual(first);
    });
  });

  describe('Edge Cases', () => {
    it('should prevent duplicate invitations across requests', async () => {
      const sessionCookie = await createAdminSession();

      const { response: firstRes } = await makeInviteRequest(['user@example.com'], sessionCookie);
      expect(firstRes.status).toBe(200);

      const { response: secondRes, data } = await makeInviteRequest(['user@example.com'], sessionCookie);
      expect(secondRes.status).toBe(200);

      const response = data as { data: any[]; rejectedIds: string[]; invitesSentCount: number };
      expect(response.invitesSentCount).toBe(0);
      expect(response.rejectedIds).toContain('user@example.com');
    });
  });
});
