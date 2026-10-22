import { decryptData, encryptData } from '#/utils/data-encryption';

const totpSecretPurpose = 'auth:totp-secret:v1';

export const encryptTotpSecret = (secret: string): string => encryptData(secret, totpSecretPurpose);

export const decryptTotpSecret = (encryptedSecret: string): string => decryptData(encryptedSecret, totpSecretPurpose);
