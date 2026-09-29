import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTOTPKeyURI, generateTOTP, matchTOTPStep } from '#/modules/auth/totps/helpers/totp-core';

// RFC 6238 Appendix B test vectors: HMAC-SHA1, 8 digits, 30s interval, ASCII secret "12345678901234567890"
const rfcKey = new TextEncoder().encode('12345678901234567890');
const rfcVectors: [number, string][] = [
  [59, '94287082'],
  [1111111109, '07081804'],
  [1111111111, '14050471'],
  [1234567890, '89005924'],
  [2000000000, '69279037'],
  [20000000000, '65353130'],
];

afterEach(() => {
  vi.useRealTimers();
});

describe('generateTOTP', () => {
  it.each(rfcVectors)('matches the RFC 6238 vector at t=%i', (time, expected) => {
    expect(generateTOTP(rfcKey, 30, 8, time)).toBe(expected);
  });

  it('zero-pads codes to the requested digit count', () => {
    expect(generateTOTP(rfcKey, 30, 8, 1111111109)).toBe('07081804');
    expect(generateTOTP(rfcKey, 30, 8, 1111111109)).toHaveLength(8);
  });
});

describe('matchTOTPStep', () => {
  it('returns the step of the current code and of codes within the grace period', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1111111111 * 1000));

    // Current step and the previous one (30s earlier, within a 60s grace period)
    expect(matchTOTPStep(rfcKey, 30, 8, '14050471', 60)).toBe(Math.floor(1111111111 / 30));
    expect(matchTOTPStep(rfcKey, 30, 8, '07081804', 60)).toBe(Math.floor(1111111109 / 30));
  });

  it('rejects codes outside the grace period', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1111111111 * 1000));

    // Code for t=59 is decades away from the fake clock
    expect(matchTOTPStep(rfcKey, 30, 8, '94287082', 60)).toBeNull();
    // Three steps (90s) either side is past a 60s grace period: the window is five codes, never more.
    expect(matchTOTPStep(rfcKey, 30, 8, generateTOTP(rfcKey, 30, 8, 1111111111 - 90), 60)).toBeNull();
    expect(matchTOTPStep(rfcKey, 30, 8, generateTOTP(rfcKey, 30, 8, 1111111111 + 90), 60)).toBeNull();
  });

  it('rejects codes with the wrong length without throwing', () => {
    expect(matchTOTPStep(rfcKey, 30, 8, '123', 60)).toBeNull();
    expect(matchTOTPStep(rfcKey, 30, 8, '', 60)).toBeNull();
    // Eight characters, but not eight bytes
    expect(matchTOTPStep(rfcKey, 30, 8, '١٤٠٥٠٤٧١', 60)).toBeNull();
  });
});

describe('createTOTPKeyURI', () => {
  it('builds an otpauth URI with base32 secret and all parameters', () => {
    const uri = createTOTPKeyURI('Cella App', 'user@example.com', rfcKey, 30, 6);
    const url = new URL(uri);

    expect(url.protocol).toBe('otpauth:');
    expect(uri).toContain('otpauth://totp/Cella%20App:user%40example.com?');
    expect(url.searchParams.get('secret')).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(url.searchParams.get('issuer')).toBe('Cella App');
    expect(url.searchParams.get('algorithm')).toBe('SHA1');
    expect(url.searchParams.get('digits')).toBe('6');
    expect(url.searchParams.get('period')).toBe('30');
  });
});
