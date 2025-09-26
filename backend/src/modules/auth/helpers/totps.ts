import { decodeBase32 } from '@oslojs/encoding';
import { verifyTOTPWithGracePeriod } from '@oslojs/otp';
import { appConfig } from 'config';

const { intervalInSeconds, digits, gracePeriodInSeconds } = appConfig.totpConfig;

/**
 * Verifies a Time-based One-Time Password (TOTP) code.
 *
 * Decodes the secret from Base32 format.
 * Checks provided OTP against secret using configured interval, number of digits, and grace period.
 *
 * @param {string} otp - The TOTP code provided by the user.
 * @param {string} secret - The Base32-encoded shared secret.
 * @returns {boolean} - Returns `true` if the OTP is valid within the grace period, otherwise `false`.
 */
export const signInWithTotp = (otp: string, secret: string): boolean => {
  const secretBytes = decodeBase32(secret);

  return verifyTOTPWithGracePeriod(secretBytes, intervalInSeconds, digits, otp, gracePeriodInSeconds);
};
