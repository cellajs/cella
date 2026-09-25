import { sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { signYjsToken, verifyYjsToken, yjsTokenPublicKey, yjsTokenSigningKey, yjsTokenVerifyKey } from './yjs-token';

const material = 'backend-key-material-of-at-least-32-chars';
const claims = { userId: 'user-1', entityType: 'attachment', tenantId: 'tenant-1', organizationId: 'org-1' };

describe('yjs token keys', () => {
  it('verifies with the public key what the key material signs (positive control)', () => {
    const token = signYjsToken(claims, yjsTokenSigningKey(material), 60_000);
    const result = verifyYjsToken(token, yjsTokenVerifyKey(yjsTokenPublicKey(material)));
    expect(result.ok && result.payload).toMatchObject(claims);
  });

  it('derives the same public key from the same material, so a deploy can compute the one the relay needs', () => {
    expect(yjsTokenPublicKey(material)).toBe(yjsTokenPublicKey(material));
    expect(yjsTokenPublicKey(material)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(yjsTokenPublicKey(`${material}x`)).not.toBe(yjsTokenPublicKey(material));
  });

  it('must not verify a token signed from other key material', () => {
    const token = signYjsToken(claims, yjsTokenSigningKey(`${material}x`), 60_000);
    expect(verifyYjsToken(token, yjsTokenVerifyKey(yjsTokenPublicKey(material)))).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
  });

  it('must not let the public key sign a token', () => {
    const verifyKey = yjsTokenVerifyKey(yjsTokenPublicKey(material));
    expect(verifyKey.type).toBe('public');
    expect(() => sign(null, Buffer.from('payload'), verifyKey)).toThrow();
  });

  it('must not accept a value that is not an Ed25519 public key', () => {
    for (const value of ['', 'not-a-key', Buffer.alloc(16).toString('base64url')]) {
      expect(() => yjsTokenVerifyKey(value), value).toThrow();
    }
  });
});
