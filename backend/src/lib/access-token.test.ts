import { describe, expect, it } from 'vitest';
import { generateAccessToken, getTokenTtl, tokenHasOrgAccess, verifyAccessToken } from '#/lib/access-token';

describe('access-token', () => {
  const userId = 'user-123';
  const orgIds = ['org-1', 'org-2'];

  describe('generateAccessToken', () => {
    it('should generate a valid token', () => {
      const token = generateAccessToken(userId, orgIds);

      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(2); // data.signature
    });

    it('should generate different tokens for different users', () => {
      const token1 = generateAccessToken('user-1', orgIds);
      const token2 = generateAccessToken('user-2', orgIds);

      expect(token1).not.toBe(token2);
    });
  });

  describe('verifyAccessToken', () => {
    it('should verify and decode a valid token', () => {
      const token = generateAccessToken(userId, orgIds);
      const payload = verifyAccessToken(token);

      expect(payload).not.toBeNull();
      expect(payload?.userId).toBe(userId);
      expect(payload?.organizationIds).toEqual(orgIds);
      expect(payload?.expiresAt).toBeGreaterThan(Date.now());
    });

    it('should return null for invalid format', () => {
      expect(verifyAccessToken('invalid')).toBeNull();
      expect(verifyAccessToken('')).toBeNull();
      expect(verifyAccessToken('a.b.c')).toBeNull();
    });

    it('should return null for tampered token', () => {
      const token = generateAccessToken(userId, orgIds);
      const [data, signature] = token.split('.');

      // Tamper with signature
      const tamperedToken = `${data}.${signature.slice(0, -1)}x`;
      expect(verifyAccessToken(tamperedToken)).toBeNull();
    });

    it('should return null for tampered data', () => {
      const token = generateAccessToken(userId, orgIds);
      const [_, signature] = token.split('.');

      // Create different payload
      const fakePayload = Buffer.from(
        JSON.stringify({ userId: 'hacker', organizationIds: ['evil-org'], expiresAt: Date.now() + 1000000 }),
      ).toString('base64url');

      const tamperedToken = `${fakePayload}.${signature}`;
      expect(verifyAccessToken(tamperedToken)).toBeNull();
    });
  });

  describe('tokenHasOrgAccess', () => {
    it('should return true for included org', () => {
      const token = generateAccessToken(userId, orgIds);

      expect(tokenHasOrgAccess(token, 'org-1')).toBe(true);
      expect(tokenHasOrgAccess(token, 'org-2')).toBe(true);
    });

    it('should return false for non-included org', () => {
      const token = generateAccessToken(userId, orgIds);

      expect(tokenHasOrgAccess(token, 'org-3')).toBe(false);
    });

    it('should return false for invalid token', () => {
      expect(tokenHasOrgAccess('invalid-token', 'org-1')).toBe(false);
    });
  });

  describe('getTokenTtl', () => {
    it('should return positive TTL for valid token', () => {
      const token = generateAccessToken(userId, orgIds);
      const ttl = getTokenTtl(token);

      expect(ttl).toBeGreaterThan(0);
      // Should be close to 10 minutes (600000ms)
      expect(ttl).toBeLessThanOrEqual(10 * 60 * 1000);
      expect(ttl).toBeGreaterThan(9 * 60 * 1000);
    });

    it('should return 0 for invalid token', () => {
      expect(getTokenTtl('invalid')).toBe(0);
    });
  });
});
