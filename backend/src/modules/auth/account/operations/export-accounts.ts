import type { DbContext } from '#/core/context';
import { passkeysTable } from '#/modules/auth/flows/passkeys/passkeys-db';
import { decryptTotpSecret } from '#/modules/auth/flows/totps/helpers/totp-secret-encryption';
import { totpsTable } from '#/modules/auth/flows/totps/totps-db';
import { emailsTable } from '#/modules/user/emails-db';
import { usersTable } from '#/modules/user/user-db';

/** The AAGUID of an authenticator that named none: WebAuthn's value for an attestation of `none`. */
const unknownAaguid = '00000000-0000-0000-0000-000000000000';

/**
 * Every account with a proven address, in the import shape of the authenticator Hanko (`hanko user import`, held to its
 * JSON schema by `backend/tests/sign-in/auth-export.test.ts`): the app's id as the user id, its addresses (the primary
 * first, each proven one verified), its passkeys with what registration reported, and its authenticator secret decrypted
 * (the app's TOTP is SHA1 over 30 seconds, which is what the import takes). An anonymous account has no proven address
 * and stays out. A passkey from before the portability columns carries the unknown AAGUID, no backup flags and an empty
 * handle, which Hanko reads as the user id. Decrypted secrets leave the database with this: the caller keeps the result
 * where database dumps go.
 */
export const exportAccounts = async (ctx: DbContext) => {
  const [users, emails, passkeys, totps] = await Promise.all([
    ctx.var.db.select().from(usersTable),
    ctx.var.db.select().from(emailsTable),
    ctx.var.db.select().from(passkeysTable),
    ctx.var.db.select().from(totpsTable),
  ]);
  const emailsOf = Map.groupBy(emails, (email) => email.userId);
  const passkeysOf = Map.groupBy(passkeys, (passkey) => passkey.userId);
  const totpOf = new Map(totps.map((totp) => [totp.userId, totp]));

  return users
    .filter((user) => emailsOf.has(user.id))
    .map((user) => {
      const proven = emailsOf.get(user.id) ?? [];
      const credentials = (passkeysOf.get(user.id) ?? []).map((passkey) => ({
        id: passkey.credentialId,
        name: passkey.nameOnDevice,
        public_key: passkey.publicKey,
        attestation_type: passkey.attestationFormat ?? 'none',
        aaguid: passkey.aaguid ?? unknownAaguid,
        sign_count: passkey.counter,
        last_used_at: passkey.lastUsedAt ?? passkey.createdAt,
        created_at: passkey.createdAt,
        updated_at: passkey.lastUsedAt ?? passkey.createdAt,
        transports: passkey.transports ?? [],
        backup_eligible: passkey.backupEligible ?? false,
        backup_state: passkey.backupState ?? false,
        mfa_only: false,
        user_handle: passkey.userHandle ?? '',
      }));
      const totp = totpOf.get(user.id);
      return {
        user_id: user.id,
        emails: [
          { address: user.email, is_primary: true, is_verified: proven.some(({ email }) => email === user.email) },
          ...proven.filter(({ email }) => email !== user.email).map(({ email }) => ({ address: email, is_primary: false, is_verified: true })),
        ],
        ...(credentials.length > 0 && { webauthn_credentials: credentials }),
        ...(totp && { otp_secret: { secret: decryptTotpSecret(totp.secret), created_at: totp.createdAt } }),
        created_at: user.createdAt,
        updated_at: user.updatedAt ?? user.createdAt,
      };
    });
};
