import { describe, expect, it } from 'vitest';
import { scrubUrl } from './scrub-url.ts';

describe('scrubUrl', () => {
  describe('secret path segments', () => {
    it('redacts the invoke-token bearer segment (bare path)', () => {
      expect(scrubUrl('/auth/invoke-token/magic/super-secret-token')).toBe('/auth/invoke-token/magic/[REDACTED]');
    });

    it('redacts the token segment for every token type', () => {
      for (const type of ['magic', 'invitation', 'oauth-verification']) {
        expect(scrubUrl(`/auth/invoke-token/${type}/abc123`)).toBe(`/auth/invoke-token/${type}/[REDACTED]`);
      }
    });

    it('redacts the token segment inside a full URL and keeps the origin', () => {
      expect(scrubUrl('https://api.example.com/auth/invoke-token/magic/tok_123')).toBe(
        'https://api.example.com/auth/invoke-token/magic/[REDACTED]',
      );
    });

    it('redacts the token segment behind a mount prefix, in any case, and keeps what follows', () => {
      expect(scrubUrl('/api/auth/invoke-token/magic/tok_123?x=1')).toBe('/api/auth/invoke-token/magic/[REDACTED]?x=1');
      expect(scrubUrl('/API/AUTH/INVOKE-TOKEN/MAGIC/tok_123')).toBe('/API/AUTH/INVOKE-TOKEN/MAGIC/[REDACTED]');
      expect(scrubUrl('/auth/invoke-token//tok_123')).toBe('/auth/invoke-token//[REDACTED]');
    });

    it('leaves the token-data path (id, not secret) untouched', () => {
      // getTokenData uses /token/{type}/{id}, not the invoke-token secret path.
      expect(scrubUrl('/auth/token/invitation/some-token-id')).toBe('/auth/token/invitation/some-token-id');
    });
  });

  describe('sensitive query keys', () => {
    it('redacts OAuth code and state', () => {
      const scrubbed = scrubUrl('/auth/github/callback?code=authz_code_123&state=state_456');
      expect(scrubbed).toBe('/auth/github/callback?code=[REDACTED]&state=[REDACTED]');
    });

    it('redacts an unsubscribe token in the query', () => {
      expect(scrubUrl('/me/unsubscribe?token=unsub_secret')).toBe('/me/unsubscribe?token=[REDACTED]');
    });

    it('redacts provider and OIDC token query keys', () => {
      const scrubbed = scrubUrl(
        '/x?access_token=a1&id_token=b1&refresh_token=c1&code_verifier=d1&id_token_hint=e1&client_secret=f1',
      );
      for (const secret of ['a1', 'b1', 'c1', 'd1', 'e1', 'f1']) expect(scrubbed).not.toContain(secret);
    });

    it("redacts OpenTelemetry's default keys: signed storage URL parameters", () => {
      const scrubbed = scrubUrl(
        'https://bucket.s3.example.com/k?X-Amz-Credential=cred1&X-Amz-Signature=sig1&X-Amz-Security-Token=st1&X-Amz-Expires=900&AWSAccessKeyId=ak1&Signature=sig2&sig=sig3&X-Goog-Signature=sig4',
      );
      for (const secret of ['cred1', 'sig1', 'st1', 'ak1', 'sig2', 'sig3', 'sig4'])
        expect(scrubbed).not.toContain(secret);
      expect(scrubbed).toContain('X-Amz-Expires=900');
    });

    it('redacts sensitive keys case-insensitively', () => {
      expect(scrubUrl('/x?Token=abc')).toBe('/x?Token=[REDACTED]');
    });

    it('redacts a bare query string, with or without the leading question mark', () => {
      expect(scrubUrl('token=abc&page=2')).toBe('token=[REDACTED]&page=2');
      expect(scrubUrl('?page=2&state=xyz')).toBe('?page=2&state=[REDACTED]');
    });

    it('redacts a token carried in the fragment', () => {
      expect(scrubUrl('/cb#access_token=abc&type=bearer')).toBe('/cb#access_token=[REDACTED]&type=bearer');
    });

    it('preserves non-sensitive query params, including keys that only end like a sensitive one', () => {
      expect(scrubUrl('/entities?page=2&sort=name')).toBe('/entities?page=2&sort=name');
      expect(scrubUrl('/x?xtoken=1&statecode=2')).toBe('/x?xtoken=1&statecode=2');
    });
  });

  describe('userinfo', () => {
    it('redacts the credentials part of a URL and keeps host and path', () => {
      expect(scrubUrl('postgresql://app:hunter2@10.0.0.5:5432/db?sslmode=require')).toBe(
        'postgresql://[REDACTED]@10.0.0.5:5432/db?sslmode=require',
      );
      expect(scrubUrl('https://x-access-token:ghs_abc@github.com/o/r.git')).toBe(
        'https://[REDACTED]@github.com/o/r.git',
      );
    });

    it('leaves an at sign outside the authority alone', () => {
      expect(scrubUrl('https://example.com/u?email=a@b.com')).toBe('https://example.com/u?email=a@b.com');
    });
  });

  describe('text that contains URLs', () => {
    it('redacts every URL in a message and keeps the words around it', () => {
      const message =
        'request to https://matrix.example/_matrix/client/v3/rooms/r/send?access_token=syt_secret failed, then /auth/invoke-token/magic/tok_1 404';
      expect(scrubUrl(message)).toBe(
        'request to https://matrix.example/_matrix/client/v3/rooms/r/send?access_token=[REDACTED] failed, then /auth/invoke-token/magic/[REDACTED] 404',
      );
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
      expect(scrubUrl('/x?token=secret#section')).toBe('/x?token=[REDACTED]#section');
      expect(scrubUrl('/path#frag')).toBe('/path#frag');
    });
  });
});
