import { eq } from 'drizzle-orm';
import type { Context } from 'hono';
import type { Env } from '#/core/context';
import { baseDb as db } from '#/db/db';
import { defaultOptions } from '#/middlewares/rate-limiter/core';
import { sendAccountSecurityEmail } from '#/modules/auth/general/helpers/send-account-security-email';
import { findBoundToken } from '#/modules/auth/tokens/token-lifecycle';
import { usersTable } from '#/modules/user/user-db';

/** Extract email from rate limit key like "email:user@example.com" or "email:user@example.comip:1.2.3.4" */
const emailFromKey = (key: string) => {
  const match = key.match(/email:([^\s]+?)(?:ip:|$)/);
  return match?.[1] ?? null;
};

/** Resolves the account behind an IP-only key from the `confirm-mfa` challenge. Reads only: the challenge stays open. */
const emailFromMfaCookie = async (ctx: Context<Env>) => (await findBoundToken(ctx, 'confirm-mfa'))?.email ?? null;

/**
 * Sends a lockout notification. Fire-and-forget: failures are absorbed so a broken mail path cannot fail the response.
 * @param limits - The blocking limiter's own limits, so the email reports its real attempt count and block duration.
 */
export const sendLockoutEmail = (
  rateLimitKey: string,
  type: 'totp-lockout',
  ctx?: Context<Env>,
  limits: { points: number; blockDuration: number } = defaultOptions,
) => {
  (async () => {
    const email = emailFromKey(rateLimitKey) ?? (ctx ? await emailFromMfaCookie(ctx) : null);
    if (!email) return;

    const [user] = await db
      .select({ email: usersTable.email, name: usersTable.name, language: usersTable.language })
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);

    if (user)
      sendAccountSecurityEmail(user, type, {
        attempts: String(limits.points),
        duration: String(Math.round(limits.blockDuration / 60)),
      });
  })().catch(() => {});
};
