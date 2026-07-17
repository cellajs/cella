import { and, eq, gt } from 'drizzle-orm';
import type { Context } from 'hono';
import type { Env } from '#/core/context';
import { baseDb as db } from '#/db/db';
import { defaultOptions } from '#/middlewares/rate-limiter/core';
import { getAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { sendAccountSecurityEmail } from '#/modules/auth/general/helpers/send-account-security-email';
import { tokensTable } from '#/modules/auth/tokens-db';
import { usersTable } from '#/modules/user/user-db';
import { encodeLowerCased } from '#/utils/oslo';

/** Extract email from rate limit key like "email:user@example.com" or "email:user@example.comip:1.2.3.4" */
const emailFromKey = (key: string) => {
  const match = key.match(/email:([^\s]+?)(?:ip:|$)/);
  return match?.[1] ?? null;
};

/**
 * Resolve the blocked account behind an IP-only rate limit key. TOTP verification bodies carry
 * just the code, so the key has no email segment; the pending user is identified by the
 * `confirm-mfa` cookie. This remains read-only because invoking the token would consume the
 * user's MFA challenge as a side effect of a notification.
 */
const emailFromMfaCookie = async (ctx: Context<Env>) => {
  const tokenFromCookie = await getAuthCookie(ctx, 'confirm-mfa');
  if (!tokenFromCookie) return null;

  const [tokenRecord] = await db
    .select({ email: tokensTable.email })
    .from(tokensTable)
    .where(
      and(
        eq(tokensTable.secret, encodeLowerCased(tokenFromCookie)),
        eq(tokensTable.type, 'confirm-mfa'),
        gt(tokensTable.expiresAt, new Date().toISOString()),
      ),
    )
    .limit(1);

  return tokenRecord?.email ?? null;
};

/**
 * Look up the affected user and send a lockout notification. Fire-and-forget: failures are
 * swallowed so a broken mail path can never fail the rate limit response itself.
 *
 * @param limits - The blocking limiter's own limits, so the email reports the real attempt
 *   count and block duration, overriding the defaults.
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
