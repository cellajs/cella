import { decryptData, encryptData } from '#/utils/data-encryption';

/** Derives the key of every stored TOTP secret, so changing it leaves them all unreadable. */
const totpSecretPurpose = 'auth:totp-secret:v1';

/** Encrypts a Base32 TOTP secret for storage, with a key derived from `DATA_ENCRYPTION_KEY` for this purpose alone. */
export const encryptTotpSecret = (secret: string): string => encryptData(secret, totpSecretPurpose);

/**
 * The Base32 TOTP secret {@link encryptTotpSecret} stored.
 * @throws When the value was not encrypted by it under this key, or was altered.
 */
export const decryptTotpSecret = (encryptedSecret: string): string => decryptData(encryptedSecret, totpSecretPurpose);
