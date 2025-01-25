import { config } from 'config';
import type { Context } from 'hono';
import { setCookie as baseSetCookie, setSignedCookie } from 'hono/cookie';
import type { CookieOptions } from 'hono/utils/cookie';
import { TimeSpan } from '#/utils/time-span';
import { env } from '../../../../env';

const isProduction = config.mode === 'production';

export const setCookie = async (ctx: Context, name: string, content: string, singleSession?: boolean) => {
  const options = {
    secure: isProduction, // set `Secure` flag in HTTPS
    path: '/',
    domain: isProduction ? config.domain : undefined,
    httpOnly: true,
    sameSite: isProduction ? 'lax' : 'lax', // Strict is possible once we use a proxy for api
    ...(singleSession && isProduction ? {} : { maxAge: new TimeSpan(10, 'm').seconds() }), // 10 min, omitted if singleSession is true
  } satisfies CookieOptions;

  isProduction ? await setSignedCookie(ctx, name, content, env.COOKIE_SECRET, options) : await baseSetCookie(ctx, name, content, options);
};
