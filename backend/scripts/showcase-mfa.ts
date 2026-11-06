import { getRandomValues } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { and, eq, inArray, ne } from 'drizzle-orm';
import { appConfig } from 'shared';
import { localDatabaseUrl } from 'shared/local-database';
import { getSeedDb } from '#/db/db';
import { env } from '#/env';
import { passkeysTable } from '#/modules/auth/passkeys/passkeys-db';
import { findTotp, insertTotp } from '#/modules/auth/totps/totps-queries';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { emailsTable } from '#/modules/user/emails-db';
import { updateUserMfa } from '#/modules/user/user-queries';
import { encodeBase32 } from '#/utils/base32';

/**
 * Turns MFA on for a user, with a passkey and an authenticator app that exist only to be shown, and for a share of the
 * members of their organizations, so the marketing screenshots show both MFA states. The passkey answers no sign-in and
 * nobody holds the authenticator's secret: on the database a developer signs in to, it locks their account out, so it
 * refuses the one `backend/.env` names. The screenshots skill runs it against a throwaway database.
 *
 * Usage: pnpm --filter backend showcase:mfa <email>
 */
const [email] = process.argv.slice(2);

const envFile = new URL('../.env', import.meta.url);
const fileEnv = existsSync(envFile) ? parseEnv(readFileSync(envFile, 'utf8')) : {};
const ownDatabase = fileEnv.DATABASE_ADMIN_URL ?? localDatabaseUrl('dev', 'postgres');

if (appConfig.mode !== 'development') {
  console.error(`Refusing to turn MFA on in ${appConfig.mode} mode.`);
  process.exit(1);
}
if (env.DATABASE_ADMIN_URL === ownDatabase) {
  console.error('Refusing the database backend/.env names: set DATABASE_ADMIN_URL to a throwaway one.');
  process.exit(1);
}
if (!email) {
  console.error('Usage: pnpm --filter backend showcase:mfa <email>');
  process.exit(1);
}

const db = getSeedDb();

const [owner] = await db.select({ userId: emailsTable.userId }).from(emailsTable).where(eq(emailsTable.email, email));
if (!owner) {
  console.error(`No user holds ${email}.`);
  process.exit(1);
}
const { userId } = owner;
const randomKey = () => encodeBase32(getRandomValues(new Uint8Array(20)));

await db
  .insert(passkeysTable)
  .values({
    userId,
    credentialId: `showcase-${userId}`,
    publicKey: randomKey(),
    deviceName: 'MacBook Pro',
    deviceType: 'desktop',
    deviceOs: 'macOS',
    browser: 'Chrome',
    nameOnDevice: `${email} (Swift Phoenix)`,
  })
  .onConflictDoNothing({ target: passkeysTable.credentialId });

const ctx = { var: { db } };
// Last used two hours ago: the account page shows the step as a date, and step 0 reads as 1970
const lastUsedStep = Math.floor((Date.now() - 2 * 60 * 60 * 1000) / 1000 / appConfig.totp.intervalInSeconds);
if (!(await findTotp(ctx, { userId }))) await insertTotp(ctx, { userId, secret: randomKey(), lastUsedStep });
await updateUserMfa(ctx, { id: userId, mfaRequired: true });

// The last hex digit of a UUID v7 is random: below 6 picks 6 in 16 members, the same ones on every run
const ownOrganizations = db.select({ id: membershipsTable.organizationId }).from(membershipsTable).where(eq(membershipsTable.userId, userId));
const members = await db
  .selectDistinct({ id: membershipsTable.userId })
  .from(membershipsTable)
  .where(and(inArray(membershipsTable.organizationId, ownOrganizations), ne(membershipsTable.userId, userId)));
const picked = members.map(({ id }) => id).filter((id) => Number.parseInt(id.slice(-1), 16) < 6);
for (const id of picked) await updateUserMfa(ctx, { id, mfaRequired: true });

console.info(`MFA on for ${email} (a passkey and an authenticator app) and ${picked.length} of ${members.length} members.`);
process.exit(0);
