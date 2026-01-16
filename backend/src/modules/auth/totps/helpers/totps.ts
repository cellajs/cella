import { decodeBase32 } from '@oslojs/encoding';
import { verifyTOTPWithGracePeriod } from '@oslojs/otp';
import { appConfig } from 'config';
import { eq } from 'drizzle-orm';
import { db } from '#/db/db';
import { totpsTable } from '#/db/schema/totps';
import { AppError } from '#/lib/error';

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

/**
 * Verifies a user's TOTP code.
 * - Decodes the Base32 secret.
 * - Checks the OTP against the secret using interval, digits, and grace period.
 * - Throws errors if user credentials are missing or the OTP is invalid.
 */
export const validateTOTP = async ({ code, userId }: { code: string; userId: string }) => {
  // Get totp credentials
  const [credentials] = await db.select().from(totpsTable).where(eq(totpsTable.userId, userId)).limit(1);
  if (!credentials) throw new AppError(404, 'not_found', 'warn');

  // Verify TOTP code using stored secret
  const isValid = signInWithTotp(code, credentials.secret);
  if (!isValid) throw new AppError(401, 'invalid_token', 'warn');
};
