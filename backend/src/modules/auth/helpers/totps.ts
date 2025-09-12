import { verifyTOTPWithGracePeriod } from '@oslojs/otp';
import { appConfig } from 'config';

const { intervalInSeconds, digits, gracePeriodInSeconds } = appConfig.totpConfig;

/**
 * Verifies a TOTP code.
 */
export const verifyTotp = async (otp: string, secretBytes: Uint8Array) => {
  return verifyTOTPWithGracePeriod(secretBytes, intervalInSeconds, digits, otp, gracePeriodInSeconds);
};
