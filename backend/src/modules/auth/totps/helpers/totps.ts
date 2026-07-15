import { decodeBase32 } from '@oslojs/encoding';
import { verifyTOTPWithGracePeriod } from '@oslojs/otp';
import { eq } from 'drizzle-orm';
import { appConfig } from 'shared';
import { AppError } from '#/core/error';
import { baseDb as db } from '#/db/db';
import { decryptTotpSecret } from '#/modules/auth/totps/helpers/totp-secret-encryption';
import { totpsTable } from '#/modules/auth/totps/totps-db';

const { intervalInSeconds, digits, gracePeriodInSeconds } = appConfig.totpConfig;

/** Verifies a TOTP `otp` against a Base32 `secret` using the configured interval, digits, and grace period. */
export const signInWithTotp = (otp: string, secret: string): boolean => {
  const secretBytes = decodeBase32(secret);

  return verifyTOTPWithGracePeriod(secretBytes, intervalInSeconds, digits, otp, gracePeriodInSeconds);
};

/** Loads the user's stored TOTP secret and verifies `code`; throws if no credentials or the code is invalid. */
export const validateTOTP = async ({ code, userId }: { code: string; userId: string }) => {
  // Get totp credentials
  const [credentials] = await db.select().from(totpsTable).where(eq(totpsTable.userId, userId)).limit(1);
  if (!credentials) throw new AppError(404, 'not_found', 'warn');

  // Verify TOTP code using stored secret
  const secret = decryptTotpSecret(credentials.secret);
  const isValid = signInWithTotp(code, secret);
  if (!isValid) throw new AppError(401, 'invalid_token', 'warn');
};
