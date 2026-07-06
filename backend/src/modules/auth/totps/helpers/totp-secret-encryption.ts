import { decryptData, encryptData } from '#/utils/data-encryption';

const TOTP_SECRET_PURPOSE = 'auth:totp-secret:v1';

export const encryptTotpSecret = (secret: string): string => encryptData(secret, TOTP_SECRET_PURPOSE);

export const decryptTotpSecret = (encryptedSecret: string): string => decryptData(encryptedSecret, TOTP_SECRET_PURPOSE);
