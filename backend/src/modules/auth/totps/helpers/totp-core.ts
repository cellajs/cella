import { createHmac, timingSafeEqual } from 'node:crypto';
import { encodeBase32UpperCaseNoPadding } from '@oslojs/encoding';

/** Generates an RFC 4226 HOTP code for a `counter` value using HMAC-SHA1 and dynamic truncation. */
const generateHOTP = (key: Uint8Array, counter: bigint, digits: number): string => {
  const counterBytes = Buffer.alloc(8);
  counterBytes.writeBigUInt64BE(counter);

  const mac = createHmac('sha1', Buffer.from(key)).update(counterBytes).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const truncated = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];

  return (truncated % 10 ** digits).toString().padStart(digits, '0');
};

/** Generates the RFC 6238 TOTP code for a `key` at the given unix time (defaults to now). */
export const generateTOTP = (
  key: Uint8Array,
  intervalInSeconds: number,
  digits: number,
  unixTimeInSeconds = Math.floor(Date.now() / 1000),
): string => {
  return generateHOTP(key, BigInt(Math.floor(unixTimeInSeconds / intervalInSeconds)), digits);
};

/**
 * The time step `otp` belongs to, among the steps within ±`gracePeriodInSeconds` of now, so codes survive clock drift;
 * null when it matches none. Every step is compared in constant time, and of two matching steps the later one counts.
 */
export const matchTOTPStep = (
  key: Uint8Array,
  intervalInSeconds: number,
  digits: number,
  otp: string,
  gracePeriodInSeconds: number,
): number | null => {
  const presented = Buffer.from(otp);
  if (presented.length !== digits) return null;

  const nowInSeconds = Math.floor(Date.now() / 1000);
  const firstStep = Math.floor((nowInSeconds - gracePeriodInSeconds) / intervalInSeconds);
  const lastStep = Math.floor((nowInSeconds + gracePeriodInSeconds) / intervalInSeconds);

  let matched: number | null = null;
  for (let step = firstStep; step <= lastStep; step++) {
    const expected = Buffer.from(generateHOTP(key, BigInt(step), digits));
    // Check every step (no early exit) with a constant-time comparison
    if (timingSafeEqual(expected, presented)) matched = step;
  }
  return matched;
};

/** Builds an `otpauth://` provisioning URI for authenticator apps (QR code or deep link). */
export const createTOTPKeyURI = (
  issuer: string,
  accountName: string,
  key: Uint8Array,
  periodInSeconds: number,
  digits: number,
): string => {
  const params = new URLSearchParams({
    secret: encodeBase32UpperCaseNoPadding(key),
    issuer,
    algorithm: 'SHA1',
    digits: digits.toString(),
    period: periodInSeconds.toString(),
  });
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}?${params.toString()}`;
};
