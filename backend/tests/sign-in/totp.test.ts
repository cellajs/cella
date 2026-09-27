import { eq } from 'drizzle-orm';
import { createTotp, generateTotpKey, signInWithTotp } from 'sdk';
import { afterEach, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { decryptTotpSecret } from '#/modules/auth/totps/helpers/totp-secret-encryption';
import { totpsTable } from '#/modules/auth/totps/totps-db';
import { defaultHeaders, signUpUser } from '../fixtures';
import {
  authCookie,
  cookieChange,
  createMfaToken,
  createTestSession,
  createTestUser,
  createTotpUser,
  enableMFAForUser,
  expectRefusal,
  setCookiePair,
  totpCode,
  verifyUserEmail,
  wrongTotpCode,
} from '../helpers';
import { createAppClient } from '../test-client';
import { clearDatabase, setTestConfig } from '../test-utils';

setTestConfig({ enabledAuthStrategies: ['passkey', 'totp'] });

afterEach(async () => {
  await clearDatabase();
});

describe('TOTP Authentication', async () => {
  const call = await createAppClient();

  describe('TOTP Setup', () => {
    it('should generate TOTP key for authenticated user', async () => {
      const user = await createTestUser(signUpUser.email);
      await verifyUserEmail(signUpUser.email);

      const sessionCookie = await createTestSession(user);

      const { response: res, data } = await call(generateTotpKey, {
        headers: { ...defaultHeaders, Cookie: sessionCookie },
      });

      expect(res.status).toBe(200);
      const response = data as { totpUri: string; manualKey: string };
      expect(response.totpUri).toBeTruthy();
      expect(response.manualKey).toBeTruthy();
      expect(response.manualKey).toMatch(/^[A-Z2-7]+=*$/); // Base32 format
    });

    it('should create TOTP for user with valid code', async () => {
      const user = await createTestUser(signUpUser.email);
      await verifyUserEmail(signUpUser.email);

      const sessionCookie = await createTestSession(user);

      const { response: generateRes, data: generateData } = await call(generateTotpKey, {
        headers: { ...defaultHeaders, Cookie: sessionCookie },
      });

      expect(generateRes.status).toBe(200);
      const generatedTotp = generateData as { manualKey: string };

      const allCookies = `${sessionCookie}; ${setCookiePair(generateRes, 'totp-challenge')}`;

      const { response: createRes } = await call(createTotp, {
        body: { code: totpCode(generatedTotp.manualKey) },
        headers: { ...defaultHeaders, Cookie: allCookies },
      });

      expect(createRes.status).toBe(201);

      const totpRecord = await db.select().from(totpsTable).where(eq(totpsTable.userId, user.id));
      expect(totpRecord).toHaveLength(1);
      expect(totpRecord[0].secret).toMatch(/^v1:/);
      expect(totpRecord[0].secret).not.toBe(generatedTotp.manualKey);
      expect(decryptTotpSecret(totpRecord[0].secret)).toBe(generatedTotp.manualKey);
    });
  });

  describe('TOTP Sign-In Flow', () => {
    it('should sign in with valid TOTP code', async () => {
      const user = await createTotpUser(signUpUser.email);
      const mfaToken = await createMfaToken(user);

      const { response: res } = await call(signInWithTotp, {
        body: { code: totpCode() },
        headers: {
          ...defaultHeaders,
          Cookie: authCookie('confirm-mfa', mfaToken),
        },
      });

      expect(res.status).toBe(204);
      expect(cookieChange(res, 'session')).toBe('set');
    });

    it('should reject invalid TOTP code', async () => {
      const user = await createTotpUser(signUpUser.email);
      const mfaToken = await createMfaToken(user);

      const { response: res, error } = await call(signInWithTotp, {
        body: { code: wrongTotpCode() },
        headers: {
          ...defaultHeaders,
          Cookie: authCookie('confirm-mfa', mfaToken),
        },
      });

      await expectRefusal({ response: res, error }, 401, 'invalid_token');
    });

    it('should reject TOTP verification for non-existent user', async () => {
      const { response: res, error } = await call(signInWithTotp, {
        body: { code: '123456' },
        headers: defaultHeaders,
      });

      await expectRefusal({ response: res, error }, 401, 'confirm-mfa_not_found');
    });

    it('should reject TOTP verification for user without TOTP', async () => {
      const user = await createTestUser(signUpUser.email);
      await verifyUserEmail(signUpUser.email);
      await enableMFAForUser(user.id);

      const mfaToken = await createMfaToken(user);

      // No TOTP registered for the user.
      const { response: res, error } = await call(signInWithTotp, {
        body: { code: totpCode() },
        headers: {
          ...defaultHeaders,
          Cookie: authCookie('confirm-mfa', mfaToken),
        },
      });

      await expectRefusal({ response: res, error }, 404, 'not_found');
    });
  });
});
