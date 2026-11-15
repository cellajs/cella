import type { DbContext } from '#/core/context';
import { passkeysTable } from '#/modules/auth/flows/passkeys/passkeys-db';
import { decryptTotpSecret } from '#/modules/auth/flows/totps/helpers/totp-secret-encryption';
import { totpsTable } from '#/modules/auth/flows/totps/totps-db';
import { emailsTable } from '#/modules/user/emails-db';
import { usersTable } from '#/modules/user/user-db';

/** The AAGUID of an authenticator that named none: WebAuthn's value for an attestation of `none`. */
const unknownAaguid = '00000000-0000-0000-0000-000000000000';

/** A passkey as the import of the authenticator Hanko reads it. */
interface ExportedCredential {
  id: string;
  name: string;
  public_key: string;
  attestation_type: string;
  aaguid: string;
  sign_count: number;
  last_used_at: string;
  created_at: string;
  updated_at: string;
  transports: string[];
  backup_eligible: boolean;
  backup_state: boolean;
  mfa_only: boolean;
  user_handle: string;
}

/** An account as `hanko user import` reads it: the app's own id as the user id, so a person keeps one id. */
export interface ExportedAccount {
  user_id: string;
  emails: { address: string; is_primary: boolean; is_verified: boolean }[];
  webauthn_credentials?: ExportedCredential[];
  otp_secret?: { secret: string; created_at: string };
  created_at: string;
  updated_at: string;
}

export interface AccountsExport {
  accounts: ExportedAccount[];
  /** Passkeys registered before the portability columns existed: exported with the unknown AAGUID, no backup flags and no handle. */
  passkeysWithoutPortability: number;
}

/**
 * Every account with a proven address, in the import shape of the authenticator Hanko: its addresses (the primary first,
 * each proven one verified), its passkeys with what registration reported, and its authenticator secret decrypted (the
 * app's TOTP is SHA1 over 30 seconds, which is what the import takes). An anonymous account has no proven address and
 * stays out. Decrypted secrets leave the database with this: the caller keeps the result where database dumps go.
 */
export const exportAccounts = async (ctx: DbContext): Promise<AccountsExport> => {
  const [users, emails, passkeys, totps] = await Promise.all([
    ctx.var.db.select().from(usersTable),
    ctx.var.db.select().from(emailsTable),
    ctx.var.db.select().from(passkeysTable),
    ctx.var.db.select().from(totpsTable),
  ]);

  const groupBy = <T extends { userId: string }>(rows: T[]) => Map.groupBy(rows, (row) => row.userId);
  const emailsOf = groupBy(emails);
  const passkeysOf = groupBy(passkeys);
  const totpOf = new Map(totps.map((totp) => [totp.userId, totp]));
  let passkeysWithoutPortability = 0;

  const accounts = users.flatMap((user): ExportedAccount[] => {
    const proven = emailsOf.get(user.id) ?? [];
    if (proven.length === 0) return [];

    const primaryProven = proven.some(({ email }) => email === user.email);
    const addresses = [
      { address: user.email, is_primary: true, is_verified: primaryProven },
      ...proven.filter(({ email }) => email !== user.email).map(({ email }) => ({ address: email, is_primary: false, is_verified: true })),
    ];

    const credentials = (passkeysOf.get(user.id) ?? []).map((passkey): ExportedCredential => {
      if (passkey.userHandle === null) passkeysWithoutPortability += 1;
      return {
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
        // Hanko reads an empty handle as the user id; a handle this app registered is random, and an unknown one stays empty.
        user_handle: passkey.userHandle ?? '',
      };
    });

    const totp = totpOf.get(user.id);
    return [
      {
        user_id: user.id,
        emails: addresses,
        ...(credentials.length > 0 && { webauthn_credentials: credentials }),
        ...(totp && { otp_secret: { secret: decryptTotpSecret(totp.secret), created_at: totp.createdAt } }),
        created_at: user.createdAt,
        updated_at: user.updatedAt ?? user.createdAt,
      },
    ];
  });

  return { accounts, passkeysWithoutPortability };
};
