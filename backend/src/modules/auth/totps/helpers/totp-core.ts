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

/** Verifies `otp` against every interval within ±`gracePeriodInSeconds` of now, so codes survive clock drift. Comparison is constant-time per interval. */
export const verifyTOTPWithGracePeriod = (
  key: Uint8Array,
  intervalInSeconds: number,
  digits: number,
  otp: string,
  gracePeriodInSeconds: number,
): boolean => {
  if (otp.length !== digits) return false;

  const nowInSeconds = Math.floor(Date.now() / 1000);
  const firstInterval = Math.floor((nowInSeconds - gracePeriodInSeconds) / intervalInSeconds);
  const lastInterval = Math.floor((nowInSeconds + gracePeriodInSeconds) / intervalInSeconds);

  let valid = false;
  for (let interval = firstInterval; interval <= lastInterval; interval++) {
    const expected = generateHOTP(key, BigInt(interval), digits);
    // Check every interval (no early exit) with a constant-time comparison
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(otp))) valid = true;
  }
  return valid;
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
