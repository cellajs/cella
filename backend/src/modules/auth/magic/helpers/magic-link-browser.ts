import { and, eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { appConfig } from 'shared';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb as db } from '#/db/db';
import { getAuthCookie, setAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { tokensTable } from '#/modules/auth/tokens-db';
import { hashToken } from '#/utils/hash-token';
import { isExpiredDate } from '#/utils/is-expired-date';
import { TimeSpan } from '#/utils/time-span';

/** How long a magic link stays valid, and so how long its browser remembers asking for it. */
export const magicLinkLifetime = new TimeSpan(15, 'm');

/** How long a link opened in another browser waits for its holder to confirm. */
const heldLinkLifetime = new TimeSpan(10, 'm');

/** The frontend page where a link opened in another browser is confirmed. */
export const confirmSignInPath = '/auth/confirm-sign-in';

/**
 * Remembers, in the browser that asked, which magic link it asked for: opening that link there signs in directly. Set
 * on every request, with an unrelated id when no link went out, so the response never tells whether an account exists.
 */
export const rememberMagicLinkRequest = (ctx: Context<Env>, tokenId: string) =>
  setAuthCookie(ctx, 'magic-requested', tokenId, magicLinkLifetime);

/** The unopened, unexpired magic link a raw value names, or undefined. */
export const findOpenableMagicLink = async (rawToken: string) => {
  const [token] = await db
    .select()
    .from(tokensTable)
    .where(and(eq(tokensTable.secret, hashToken(rawToken)), eq(tokensTable.type, 'magic')))
    .limit(1);
  if (!token) throw new AppError(401, 'magic_not_found', 'warn');
  if (token.invokedAt || isExpiredDate(token.expiresAt)) throw new AppError(401, 'magic_expired', 'warn');
  return token;
};

/**
 * A magic link signs in whoever opens it, so it does so directly only in the browser that asked for it, or that opened it
 * before (the redemption then proves that with the link's own single-use cookie). Anywhere else the link is held in this
 * browser and its holder confirms on the app's own page: a link planted in someone's browser, or fetched by an email
 * scanner, signs nobody in and is not used up. Returns the redirect to that page, or null to open the link directly.
 */
export const holdMagicLinkOutsideItsBrowser = async (ctx: Context<Env>, rawToken: string) => {
  if (await getAuthCookie(ctx, 'magic')) return null;

  const [token] = await db
    .select({ id: tokensTable.id })
    .from(tokensTable)
    .where(and(eq(tokensTable.secret, hashToken(rawToken)), eq(tokensTable.type, 'magic')))
    .limit(1);
  // An unknown link takes the direct path, which refuses it the same way it always has.
  if (!token || (await getAuthCookie(ctx, 'magic-requested')) === token.id) return null;

  await findOpenableMagicLink(rawToken);
  await setAuthCookie(ctx, 'magic-pending', rawToken, heldLinkLifetime);
  return ctx.redirect(new URL(confirmSignInPath, appConfig.frontendUrl), 302);
};

/** An address shown to a browser that holds a link but has not proven the inbox: enough to recognize, not to read. */
export const maskEmail = (email: string) => {
  const at = email.lastIndexOf('@');
  if (at <= 0) return '•••';
  return `${email[0]}•••${email.slice(at)}`;
};
