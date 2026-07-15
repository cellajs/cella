import { describe, expect, it } from 'vitest';
import { scrubPath, scrubUrl } from '#/utils/scrub-url';

describe('scrubUrl', () => {
  describe('secret path segments', () => {
    it('redacts the invoke-token bearer segment (bare path)', () => {
      expect(scrubUrl('/auth/invoke-token/magic/super-secret-token')).toBe('/auth/invoke-token/magic/[REDACTED]');
    });

    it('redacts the token segment for every token type', () => {
      for (const type of ['magic', 'invitation', 'email-verification', 'oauth-verification']) {
        expect(scrubUrl(`/auth/invoke-token/${type}/abc123`)).toBe(`/auth/invoke-token/${type}/[REDACTED]`);
      }
    });

    it('redacts the token segment inside a full URL and keeps the origin', () => {
      expect(scrubUrl('https://api.example.com/auth/invoke-token/magic/tok_123')).toBe(
        'https://api.example.com/auth/invoke-token/magic/[REDACTED]',
      );
    });

    it('leaves the token-data path (id, not secret) untouched', () => {
      // getTokenData uses /token/{type}/{id}, not the invoke-token secret path.
      expect(scrubUrl('/auth/token/invitation/some-token-id')).toBe('/auth/token/invitation/some-token-id');
    });
  });

  describe('sensitive query keys', () => {
    it('redacts OAuth code and state', () => {
      const scrubbed = scrubUrl('/auth/github/callback?code=authz_code_123&state=state_456');
      expect(scrubbed).not.toContain('authz_code_123');
      expect(scrubbed).not.toContain('state_456');
      expect(scrubbed).toContain('code=%5BREDACTED%5D');
      expect(scrubbed).toContain('state=%5BREDACTED%5D');
    });

    it('redacts an unsubscribe token in the query', () => {
      const scrubbed = scrubUrl('/me/unsubscribe?token=unsub_secret');
      expect(scrubbed).not.toContain('unsub_secret');
      expect(scrubbed).toContain('token=%5BREDACTED%5D');
    });

    it('redacts provider token query keys', () => {
      const scrubbed = scrubUrl('/x?access_token=a&id_token=b&refresh_token=c&code_verifier=d');
      for (const secret of ['access_token=a', 'id_token=b', 'refresh_token=c', 'code_verifier=d']) {
        expect(scrubbed).not.toContain(secret);
      }
    });

    it('redacts sensitive keys case-insensitively', () => {
      expect(scrubUrl('/x?Token=abc')).not.toContain('abc');
    });

    it('preserves non-sensitive query params', () => {
      const scrubbed = scrubUrl('/entities?page=2&sort=name');
      expect(scrubbed).toBe('/entities?page=2&sort=name');
    });
  });

  describe('passthrough and edge cases', () => {
    it('returns ordinary paths unchanged', () => {
      expect(scrubUrl('/organizations/123')).toBe('/organizations/123');
    });

    it('handles empty input', () => {
      expect(scrubUrl('')).toBe('');
    });

    it('preserves a fragment', () => {
      expect(scrubUrl('/x?token=secret#section')).not.toContain('secret');
      expect(scrubUrl('/path#frag')).toBe('/path#frag');
    });

    it('scrubPath is an alias for scrubUrl', () => {
      expect(scrubPath('/auth/invoke-token/magic/tok')).toBe(scrubUrl('/auth/invoke-token/magic/tok'));
    });
  });
});
