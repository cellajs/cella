import { describe, expect, it } from 'vitest';
import { verifyToken } from '../server/auth';
import { createSignedToken, createExpiredToken } from './helpers';

describe('verifyToken', () => {
  it('1.1.1 valid token returns payload', () => {
    const token = createSignedToken('user-1');
    const result = verifyToken(token);
    expect(result.ok).toBe(true);
    expect(result.ok && result.payload.userId).toBe('user-1');
    expect(result.ok && result.payload.exp).toBeGreaterThan(Date.now());
  });

  it('1.1.2 expired token reports expired', () => {
    const token = createExpiredToken('user-1');
    expect(verifyToken(token)).toEqual({ ok: false, reason: 'expired' });
  });

  it('1.1.3 tampered signature reports bad_signature', () => {
    const token = createSignedToken('user-1');
    const parts = token.split('.');
    const tampered = `${parts[0]}.aaaaaaaaaaaaaaaa`;
    expect(verifyToken(tampered)).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('1.1.4 tampered payload reports bad_signature', () => {
    const token = createSignedToken('user-1');
    const parts = token.split('.');
    // Modify payload but keep original signature
    const otherPayload = Buffer.from(JSON.stringify({ userId: 'hacker', exp: Date.now() + 60000 })).toString('base64url');
    const tampered = `${otherPayload}.${parts[1]}`;
    expect(verifyToken(tampered)).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('1.1.5 no delimiter reports malformed', () => {
    expect(verifyToken('nodothere')).toEqual({ ok: false, reason: 'malformed' });
  });

  it('1.1.6 empty string reports malformed', () => {
    expect(verifyToken('')).toEqual({ ok: false, reason: 'malformed' });
  });

  it('1.1.7 invalid base64 payload reports bad_signature', () => {
    expect(verifyToken('not-base64.abcd1234abcd1234')).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('1.1.8 valid base64 but invalid JSON reports bad_signature', () => {
    const notJson = Buffer.from('this is not json').toString('base64url');
    // Sign it properly so it passes HMAC check
    const token = createSignedToken('user-1');
    const sig = token.split('.')[1];
    // This will fail because the signature won't match the new payload
    expect(verifyToken(`${notJson}.${sig}`)).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('1.1.9 missing userId field reports malformed', () => {
    // Manually construct a token with only exp (no userId)
    const payload = Buffer.from(JSON.stringify({ exp: Date.now() + 60000 })).toString('base64url');
    // We need to sign it with the test secret to pass HMAC
    const { createHmac } = require('node:crypto');
    const sig = createHmac('sha256', 'test-yjs-secret-for-unit-tests').update(payload).digest('hex').slice(0, 16);
    expect(verifyToken(`${payload}.${sig}`)).toEqual({ ok: false, reason: 'malformed' });
  });

  it('1.1.10 missing exp field reports malformed', () => {
    const payload = Buffer.from(JSON.stringify({ userId: 'user-1' })).toString('base64url');
    const { createHmac } = require('node:crypto');
    const sig = createHmac('sha256', 'test-yjs-secret-for-unit-tests').update(payload).digest('hex').slice(0, 16);
    expect(verifyToken(`${payload}.${sig}`)).toEqual({ ok: false, reason: 'malformed' });
  });

  it('1.1.11 wrong signature length reports bad_signature early', () => {
    const token = createSignedToken('user-1');
    const parts = token.split('.');
    // Signature too short
    expect(verifyToken(`${parts[0]}.abc`)).toEqual({ ok: false, reason: 'bad_signature' });
    // Signature too long
    expect(verifyToken(`${parts[0]}.${'a'.repeat(32)}`)).toEqual({ ok: false, reason: 'bad_signature' });
  });
});
