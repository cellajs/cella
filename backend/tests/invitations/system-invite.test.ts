import { eq } from 'drizzle-orm';
import { inviteUsers, listRequests } from 'sdk';
import { afterEach, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { tokensTable } from '#/modules/auth/tokens/tokens-db';
import { requestsTable } from '#/modules/requests/requests-db';
import { stampWaitlistRequestMailed } from '#/modules/requests/requests-queries';
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
    return await call(inviteUsers, { body: { emails }, headers: { ...defaultHeaders, Cookie: sessionCookie } });
  }

  describe('Basic Functionality', () => {
    it('should invite new users successfully', async () => {
      const sessionCookie = await createAdminSession();
      const { response: res, data } = await makeInviteRequest(['user1@example.com', 'user2@example.com'], sessionCookie);

      expect(res.status).toBe(200);
      const response = data as { results: any[]; rejectedIds: string[]; invitationCount: number };
      expect(response.invitationCount).toBe(2);
      expect(response.rejectedIds).toHaveLength(0);

      const tokens = await db.select().from(tokensTable).where(eq(tokensTable.kind, 'invitation'));
      expect(tokens).toHaveLength(2);
      // The last mail carries the link of one of the minted tokens.
      expect(tokens.map(({ secretHash }) => secretHash)).toContain(hashToken(mailedLink('inviteLink').token));
    });

    it('should filter out existing users', async () => {
      await createTestUser('existing@example.com');
      const sessionCookie = await createAdminSession();
      const { response: res, data } = await makeInviteRequest(['existing@example.com', 'newuser@example.com'], sessionCookie);

      expect(res.status).toBe(200);
      const response = data as { results: any[]; rejectedIds: string[]; invitationCount: number };
      expect(response.invitationCount).toBe(1); // Only new user
      expect(response.rejectedIds).toContain('existing@example.com');
    });

    it('should handle duplicate emails in single request', async () => {
      const sessionCookie = await createAdminSession();
      const { response: res, data } = await makeInviteRequest(['user@example.com', 'user@example.com'], sessionCookie);

      expect(res.status).toBe(200);
      const response = data as { results: any[]; rejectedIds: string[]; invitationCount: number };
      expect(response.invitationCount).toBe(1); // Only one invitation sent
      expect(response.rejectedIds).toHaveLength(0);
    });
  });

  describe('Waitlist', () => {
    it('marks the waitlist request of an invited address as invited, at its first invitation', async () => {
      const sessionCookie = await createAdminSession();
      await db.insert(requestsTable).values([
        { email: 'waiting@example.com', kind: 'waitlist' },
        { email: 'waiting@example.com', kind: 'info' },
        { email: 'other@example.com', kind: 'waitlist' },
      ]);

      await makeInviteRequest(['waiting@example.com'], sessionCookie);

      const { data } = await call(listRequests, { query: {}, headers: { ...defaultHeaders, Cookie: sessionCookie } });
      const listed = (data as { results: { email: string; kind: string; invited: boolean }[] }).results;
      expect(listed.filter(({ invited }) => invited).map(({ email, kind }) => ({ email, kind }))).toEqual([
        { email: 'waiting@example.com', kind: 'waitlist' },
      ]);

      // A later invitation to the address leaves the first time standing.
      const invitedAtOf = async () => (await db.select().from(requestsTable).where(eq(requestsTable.kind, 'waitlist'))).map((r) => r.mailedAt);
      const first = await invitedAtOf();
      await stampWaitlistRequestMailed({ var: { db } }, { email: 'waiting@example.com' });
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

      const response = data as { results: any[]; rejectedIds: string[]; invitationCount: number };
      expect(response.invitationCount).toBe(0);
      expect(response.rejectedIds).toContain('user@example.com');
    });
  });
});
