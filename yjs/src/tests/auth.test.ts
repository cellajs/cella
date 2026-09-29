import { createHmac, generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyToken } from '../server/auth';
import { createExpiredToken, createSignedToken, signPayload } from './helpers';

const RELAY_SECRET = 'test-yjs-relay-secret-for-unit-tests';
const claims = () => ({
  userId: 'user-1',
  entityType: 'task',
  entityId: 'entity-1',
  tenantId: 'tenant-1',
  organizationId: 'org-1',
  exp: Date.now() + 60_000,
});
const encode = (payload: unknown) => Buffer.from(JSON.stringify(payload)).toString('base64url');

describe('verifyToken', () => {
  it('returns the payload of a token signed with the backend key (positive control)', () => {
    const token = createSignedToken('user-1');
    const result = verifyToken(token);
    expect(result.ok).toBe(true);
    expect(result.ok && result.payload.userId).toBe('user-1');
    expect(result.ok && result.payload.exp).toBeGreaterThan(Date.now());
  });

  it('must not accept a token minted with the relay secret', () => {
    const payloadB64 = encode(claims());
    const mac = createHmac('sha256', RELAY_SECRET).update(payloadB64).digest();
    // The relay holds this secret: neither a truncated-hex HMAC nor a full MAC passes as a signature.
    for (const signature of [mac.toString('hex').slice(0, 16), mac.toString('base64url'), mac.toString('hex')]) {
      expect(verifyToken(`${payloadB64}.${signature}`)).toEqual({ ok: false, reason: 'bad_signature' });
    }
  });

  it('must not accept a token signed with another Ed25519 key', () => {
    expect(
      verifyToken(createSignedToken({ userId: 'user-1', keyMaterial: 'another-key-material-of-32-characters' })),
    ).toEqual({ ok: false, reason: 'bad_signature' });
    const { privateKey } = generateKeyPairSync('ed25519');
    const payloadB64 = encode(claims());
    const foreign = sign(null, Buffer.from(payloadB64), privateKey).toString('base64url');
    expect(verifyToken(`${payloadB64}.${foreign}`)).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('reports an expired token as expired', () => {
    expect(verifyToken(createExpiredToken('user-1'))).toEqual({ ok: false, reason: 'expired' });
  });

  it('must not accept a changed payload under the original signature', () => {
    const [, signature] = createSignedToken('user-1').split('.');
    const forged = encode({ ...claims(), userId: 'attacker' });
    expect(verifyToken(`${forged}.${signature}`)).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('must not accept a tampered or truncated signature', () => {
    const [payloadB64, signature] = createSignedToken('user-1').split('.');
    const flipped = Buffer.from(signature, 'base64url');
    flipped[0] ^= 1;
    expect(verifyToken(`${payloadB64}.${flipped.toString('base64url')}`)).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
    expect(verifyToken(`${payloadB64}.${signature.slice(0, 40)}`)).toEqual({ ok: false, reason: 'bad_signature' });
    expect(verifyToken(`${payloadB64}.`)).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('reports a token without a delimiter, or an empty one, as malformed', () => {
    expect(verifyToken('nodothere')).toEqual({ ok: false, reason: 'malformed' });
    expect(verifyToken('')).toEqual({ ok: false, reason: 'malformed' });
  });

  it('reports a validly signed payload that is not a token as malformed', () => {
    expect(verifyToken(signPayload('not an object'))).toEqual({ ok: false, reason: 'malformed' });
    const { userId: _userId, ...withoutUser } = claims();
    expect(verifyToken(signPayload(withoutUser))).toEqual({ ok: false, reason: 'malformed' });
    const { exp: _exp, ...withoutExp } = claims();
    expect(verifyToken(signPayload(withoutExp))).toEqual({ ok: false, reason: 'malformed' });
  });
});
