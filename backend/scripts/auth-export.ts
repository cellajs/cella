import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { baseDb as db } from '#/db/db';
import { exportAccounts } from '#/modules/auth/account/operations/export-accounts';

/**
 * Writes every account with a proven address in the import shape of the authenticator Hanko (`hanko user import`): the
 * app's id, the addresses, the passkeys and the authenticator secret. A switch keeps every sign-in method. The secrets
 * are decrypted in the file: keep it where the database's own dumps go, and delete it once imported.
 *
 * Usage: pnpm --filter backend auth:export --out accounts.json   (stdout without --out)
 */
const { values } = parseArgs({ options: { out: { type: 'string' } } });

const { accounts, passkeysWithoutPortability } = await exportAccounts({ var: { db } });
const json = JSON.stringify(accounts, null, 2);

if (values.out) writeFileSync(values.out, json);
else console.log(json);

const passkeys = accounts.reduce((sum, account) => sum + (account.webauthn_credentials?.length ?? 0), 0);
const totps = accounts.filter((account) => account.otp_secret).length;
console.error(`${accounts.length} accounts, ${passkeys} passkeys, ${totps} authenticator secrets${values.out ? ` written to ${values.out}` : ''}.`);
if (passkeysWithoutPortability > 0) {
  console.error(
    `${passkeysWithoutPortability} passkeys predate the portability columns: exported with the unknown AAGUID, no backup flags and no handle.`,
  );
}
process.exit(0);
