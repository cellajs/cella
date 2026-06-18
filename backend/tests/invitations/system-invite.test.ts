import { eq } from 'drizzle-orm';
import { systemInvite } from 'sdk';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { baseDb as db } from '#/db/db';
import { tokensTable } from '#/modules/auth/tokens-db';
import { defaultHeaders } from '../fixtures';
import { createSystemAdminUser, createTestSession, createTestUser } from '../helpers';
import { createAppClient } from '../test-client';
import { clearDatabase, mockFetchRequest, setTestConfig } from '../test-utils';

vi.mock('#/modules/system/handlers', async () => {
  const actual = await vi.importActual('#/modules/system/handlers');
  return {
    ...actual,
    SystemInviteEmail: vi.fn().mockResolvedValue(undefined),
  };
});

setTestConfig({
  enabledAuthStrategies: ['passkey'],
  selfRegistration: true,
});

beforeAll(async () => {
  mockFetchRequest();
});

afterEach(async () => await clearDatabase());

describe('System Invitation', async () => {
  const call = await createAppClient();

  // Helper function to create admin session
  async function createAdminSession() {
    const admin = await createSystemAdminUser('admin@example.com');
    return await createTestSession(admin);
  }

  // Helper function to make invite request
  async function makeInviteRequest(emails: string[], sessionCookie: string) {
    return await call(systemInvite, {
      body: { emails },
      headers: { ...defaultHeaders, Cookie: sessionCookie },
    });
  }

  describe('Basic Functionality', () => {
    it('should invite new users successfully', async () => {
      const sessionCookie = await createAdminSession();
      const { response: res, data } = await makeInviteRequest(
        ['user1@example.com', 'user2@example.com'],
        sessionCookie,
      );

      expect(res.status).toBe(200);
      const response = data as {
        data: any[];
        rejectedIds: string[];
        invitesSentCount: number;
      };
      expect(response.invitesSentCount).toBe(2);
      expect(response.rejectedIds).toHaveLength(0);

      // Verify invitation tokens were created
      const tokens = await db.select().from(tokensTable).where(eq(tokensTable.type, 'invitation'));
      expect(tokens).toHaveLength(2);
    });

    it('should filter out existing users', async () => {
      await createTestUser('existing@example.com');
      const sessionCookie = await createAdminSession();
      const { response: res, data } = await makeInviteRequest(
        ['existing@example.com', 'newuser@example.com'],
        sessionCookie,
      );

      expect(res.status).toBe(200);
      const response = data as {
        data: any[];
        rejectedIds: string[];
        invitesSentCount: number;
      };
      expect(response.invitesSentCount).toBe(1); // Only new user
      expect(response.rejectedIds).toContain('existing@example.com');
    });

    it('should handle duplicate emails in single request', async () => {
      const sessionCookie = await createAdminSession();
      const { response: res, data } = await makeInviteRequest(['user@example.com', 'user@example.com'], sessionCookie);

      expect(res.status).toBe(200);
      const response = data as {
        data: any[];
        rejectedIds: string[];
        invitesSentCount: number;
      };
      expect(response.invitesSentCount).toBe(1); // Only one invitation sent
      expect(response.rejectedIds).toHaveLength(0);
    });
  });

  describe('Security & Authorization', () => {
    it('should reject unauthenticated requests', async () => {
      const { response: res } = await call(systemInvite, {
        body: { emails: ['user@example.com'] },
        headers: defaultHeaders,
      });

      expect(res.status).toBe(401);
    });

    it('should reject non-admin users', async () => {
      const user = await createTestUser('user@example.com');
      const sessionCookie = await createTestSession(user);

      const { response: res } = await makeInviteRequest(['newuser@example.com'], sessionCookie);
      expect(res.status).toBe(403);
    });
  });

  describe('Input Validation', () => {
    it('should reject empty email list', async () => {
      const sessionCookie = await createAdminSession();
      // SDK validates client-side before sending the request
      const { error, response } = await makeInviteRequest([], sessionCookie);
      expect(error).toBeInstanceOf(Error);
      expect(response).toBeUndefined();
    });

    it('should reject invalid email formats', async () => {
      const sessionCookie = await createAdminSession();
      // SDK validates client-side before sending the request
      const { error, response } = await makeInviteRequest(['invalid-email', 'user@example.com'], sessionCookie);
      expect(error).toBeInstanceOf(Error);
      expect(response).toBeUndefined();
    });
  });

  describe('Edge Cases', () => {
    it('should prevent duplicate invitations across requests', async () => {
      const sessionCookie = await createAdminSession();

      // First invitation
      const { response: firstRes } = await makeInviteRequest(['user@example.com'], sessionCookie);
      expect(firstRes.status).toBe(200);

      // Second invitation for same user
      const { response: secondRes, data } = await makeInviteRequest(['user@example.com'], sessionCookie);
      expect(secondRes.status).toBe(200);

      const response = data as { data: any[]; rejectedIds: string[]; invitesSentCount: number };
      expect(response.invitesSentCount).toBe(0);
      expect(response.rejectedIds).toContain('user@example.com');
    });

    it('should handle multiple valid emails efficiently', async () => {
      const sessionCookie = await createAdminSession();
      const emails = ['user1@example.com', 'user2@example.com', 'user3@example.com'];
      const { response: res, data } = await makeInviteRequest(emails, sessionCookie);

      expect(res.status).toBe(200);
      const response = data as {
        data: any[];
        rejectedIds: string[];
        invitesSentCount: number;
      };
      expect(response.invitesSentCount).toBe(3);
      expect(response.rejectedIds).toHaveLength(0);
    });
  });
});
