import { eq } from 'drizzle-orm';
import { baseDb as db } from '#/db/db';
import { usersTable } from '#/db/schema/users';
import { defaultOptions } from '#/middlewares/rate-limiter/core';
import { sendAccountSecurityEmail } from '#/modules/auth/general/helpers/send-account-security-email';

/** Extract email from rate limit key like "email:user@example.com" or "email:user@example.comip:1.2.3.4" */
const emailFromKey = (key: string) => {
  const match = key.match(/email:([^\s]+?)(?:ip:|$)/);
  return match?.[1] ?? null;
};

/** Look up user by email and send a lockout notification */
export const sendLockoutEmail = (rateLimitKey: string, type: 'totp-lockout') => {
  const email = emailFromKey(rateLimitKey);
  if (!email) return;

  const duration = Math.round(defaultOptions.blockDuration / 60);

  db.select({ email: usersTable.email, name: usersTable.name, language: usersTable.language })
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1)
    .then(([user]) => {
      if (user)
        sendAccountSecurityEmail(null, user, type, {
          attempts: String(defaultOptions.points),
          duration: String(duration),
        });
    })
    .catch(() => {});
};
