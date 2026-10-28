import { and, eq, isNotNull, lte, or } from 'drizzle-orm';
import { appConfig } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import { baseDb as db } from '#/db/db';
import { authCookieName, sealAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { sessionsTable } from '#/modules/auth/sessions/sessions-db';
import { emailsTable } from '#/modules/user/emails-db';
import { newHashedToken } from '#/utils/hash-token';
import { getIsoDate } from '#/utils/iso-date';

/**
 * Mints a session for a local user and prints its signed cookie, for driving the app with curl or a browser without
 * signing in. Cookies are signed in every mode, so a hand-built cookie never authenticates. Refuses outside
 * development and test.
 *
 * Usage: pnpm --filter backend session:mint <email> [hours]
 */
const [email, hoursArg] = process.argv.slice(2);

if (appConfig.mode !== 'development' && appConfig.mode !== 'test') {
  console.error(`Refusing to mint a session in ${appConfig.mode} mode.`);
  process.exit(1);
}
if (!email) {
  console.error('Usage: pnpm --filter backend session:mint <email> [hours]');
  process.exit(1);
}

const [owner] = await db.select({ userId: emailsTable.userId }).from(emailsTable).where(eq(emailsTable.email, email));
if (!owner) {
  console.error(`No user holds ${email}.`);
  process.exit(1);
}

// The user's sessions list shows a minted row; the name tells it apart from their own browsers
const deviceName = 'session:mint';
const now = getIsoDate();

// Ended mints of earlier runs would otherwise fill the user's sessions list for the retention period
await db
  .delete(sessionsTable)
  .where(
    and(
      eq(sessionsTable.userId, owner.userId),
      eq(sessionsTable.deviceName, deviceName),
      or(isNotNull(sessionsTable.revokedAt), lte(sessionsTable.expiresAt, now)),
    ),
  );

const hours = Number(hoursArg ?? 24);
const { raw: sessionToken, hash: secret } = newHashedToken();

await db.insert(sessionsTable).values({
  id: generateId(),
  secret,
  userId: owner.userId,
  deviceName,
  type: 'regular',
  authStrategy: 'magic',
  createdAt: now,
  expiresAt: new Date(Date.now() + hours * 60 * 60 * 1000).toISOString(),
});

const value = encodeURIComponent(sealAuthCookie('session', sessionToken, hours * 60 * 60));
console.info(`${authCookieName('session')}=${value}`);
console.info(`\ncurl ${appConfig.backendUrl}/me -H 'cookie: ${authCookieName('session')}=${value}'`);
process.exit(0);
