import { decodeBase32 } from '@oslojs/encoding';
import { verifyTOTP } from '@oslojs/otp';
import { appConfig } from 'config';

export const verifyTotp = async (code: string, encodedSecret: string) => {
  const decodedSecretKey = decodeBase32(encodedSecret);

  return verifyTOTP(decodedSecretKey, appConfig.totpConfig.intervalInSeconds, appConfig.totpConfig.digits, code);
};
