import { eq } from 'drizzle-orm';
import { testClient } from 'hono/testing';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '#/db/db';
import { tokensTable } from '#/db/schema/tokens';
import { defaultHeaders } from '../fixtures';
import { createPasswordUser, createSystemAdminUser, parseResponse } from '../helpers';
import { clearDatabase, mockFetchRequest, mockRateLimiter, setTestConfig } from '../test-utils';

setTestConfig({
  enabledAuthStrategies: ['password'],
  registrationEnabled: true,
});

beforeAll(async () => {
  mockFetchRequest();

  // Mock email sending
  vi.mock('#/modules/system/handlers', async () => {
    const actual = await vi.importActual('#/modules/system/handlers');
    return {
      ...actual,
      SystemInviteEmail: vi.fn().mockResolvedValue(undefined),
    };
  });

  mockRateLimiter();
});

afterEach(async () => await clearDatabase());

describe('System Invitation', async () => {
  const { default: app } = await import('#/routes');
  const client = testClient(app);

  // Helper function to create admin session
  async function createAdminSession() {
    await createSystemAdminUser('admin@cella.com', 'adminPassword123!');
    const signInRes = await client['auth']['sign-in'].$post(
      { json: { email: 'admin@cella.com', password: 'adminPassword123!' } },
      { headers: defaultHeaders },
    );
    return signInRes.headers.get('set-cookie') || '';
  }

  // Helper function to make invite request
  async function makeInviteRequest(emails: string[], sessionCookie: string) {
    return await client['system']['invite'].$post(
      { json: { emails } },
      { headers: { ...defaultHeaders, Cookie: sessionCookie } },
    );
  }

  describe('Basic Functionality', () => {
    it('should invite new users successfully', async () => {
      const sessionCookie = await createAdminSession();
      const res = await makeInviteRequest(['user1@cella.com', 'user2@cella.com'], sessionCookie);

      expect(res.status).toBe(200);
      const response = (await parseResponse(res)) as {
        success: boolean;
        rejectedItems: string[];
        invitesSentCount: number;
      };
      expect(response.success).toBe(true);
      expect(response.invitesSentCount).toBe(2);
      expect(response.rejectedItems).toHaveLength(0);

      // Verify invitation tokens were created
      const tokens = await db.select().from(tokensTable).where(eq(tokensTable.type, 'invitation'));
      expect(tokens).toHaveLength(2);
    });

    it('should filter out existing users', async () => {
      await createPasswordUser('existing@cella.com', 'password123!');
      const sessionCookie = await createAdminSession();
      const res = await makeInviteRequest(['existing@cella.com', 'newuser@cella.com'], sessionCookie);

      expect(res.status).toBe(200);
      const response = (await parseResponse(res)) as {
        success: boolean;
        rejectedItems: string[];
        invitesSentCount: number;
      };
      expect(response.success).toBe(true);
      expect(response.invitesSentCount).toBe(1); // Only new user
      expect(response.rejectedItems).toContain('existing@cella.com');
    });

    it('should handle duplicate emails in single request', async () => {
      const sessionCookie = await createAdminSession();
      const res = await makeInviteRequest(['user@cella.com', 'user@cella.com'], sessionCookie);

      expect(res.status).toBe(200);
      const response = (await parseResponse(res)) as {
        success: boolean;
        rejectedItems: string[];
        invitesSentCount: number;
      };
      expect(response.success).toBe(true);
      expect(response.invitesSentCount).toBe(1); // Only one invitation sent
      expect(response.rejectedItems).toHaveLength(0);
    });
  });

  describe('Security & Authorization', () => {
    it('should reject unauthenticated requests', async () => {
      const res = await client['system']['invite'].$post(
        { json: { emails: ['user@cella.com'] } },
        { headers: defaultHeaders },
      );

      expect(res.status).toBe(401);
    });

    it('should reject non-admin users', async () => {
      await createPasswordUser('user@cella.com', 'password123!');
      const signInRes = await client['auth']['sign-in'].$post(
        { json: { email: 'user@cella.com', password: 'password123!' } },
        { headers: defaultHeaders },
      );
      const sessionCookie = signInRes.headers.get('set-cookie') || '';

      const res = await makeInviteRequest(['newuser@cella.com'], sessionCookie);
      expect(res.status).toBe(403);
    });
  });

  describe('Input Validation', () => {
    it('should reject empty email list', async () => {
      const sessionCookie = await createAdminSession();
      const res = await makeInviteRequest([], sessionCookie);
      expect(res.status).toBe(403);
    });

    it('should reject invalid email formats', async () => {
      const sessionCookie = await createAdminSession();
      const res = await makeInviteRequest(['invalid-email', 'user@cella.com'], sessionCookie);
      expect(res.status).toBe(403);
    });
  });

  describe('Edge Cases', () => {
    it('should prevent duplicate invitations across requests', async () => {
      const sessionCookie = await createAdminSession();

      // First invitation
      const firstRes = await makeInviteRequest(['user@cella.com'], sessionCookie);
      expect(firstRes.status).toBe(200);

      // Second invitation for same user
      const secondRes = await makeInviteRequest(['user@cella.com'], sessionCookie);
      expect(secondRes.status).toBe(200);

      const response = await parseResponse<{ success: boolean; rejectedItems: string[]; invitesSentCount: number }>(
        secondRes,
      );
      expect(response.success).toBe(false); // No new invitations
      expect(response.invitesSentCount).toBe(0);
      expect(response.rejectedItems).toContain('user@cella.com');
    });

    it('should handle multiple valid emails efficiently', async () => {
      const sessionCookie = await createAdminSession();
      const emails = ['user1@cella.com', 'user2@cella.com', 'user3@cella.com'];
      const res = await makeInviteRequest(emails, sessionCookie);

      expect(res.status).toBe(200);
      const response = (await parseResponse(res)) as {
        success: boolean;
        rejectedItems: string[];
        invitesSentCount: number;
      };
      expect(response.success).toBe(true);
      expect(response.invitesSentCount).toBe(3);
      expect(response.rejectedItems).toHaveLength(0);
    });
  });
});
