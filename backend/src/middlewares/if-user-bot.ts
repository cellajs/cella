import type { MiddlewareHandler } from 'hono/types';
import { isbot } from 'isbot';
import { createIsbotFromList, isbotMatches, list } from 'isbot';
import { errorResponse } from '../lib/errors';

export const checkIsBot: MiddlewareHandler = async (ctx, next) => {
  const userAgent = ctx.req.header('user-agent');

  // Prevent crawlers from causing log spam
  if (!isbot(userAgent)) await next();
  else errorResponse(ctx, 403, 'user_maybe_bot', 'warn');
};

// Custom is bot middleware that does not consider Chrome Lighthouse user agent as bots.
export const customIsbot: MiddlewareHandler = async (ctx, next) => {
  const ChromeLighthouseUserAgentStrings: string[] = [
    'mozilla/5.0 (macintosh; intel mac os x 10_15_7) applewebkit/537.36 (khtml, like gecko) chrome/94.0.4590.2 safari/537.36 chrome-lighthouse',
    'mozilla/5.0 (linux; android 7.0; moto g (4)) applewebkit/537.36 (khtml, like gecko) chrome/94.0.4590.2 mobile safari/537.36 chrome-lighthouse',
  ];

  const patternsToRemove = new Set<string>(ChromeLighthouseUserAgentStrings.flatMap(isbotMatches));

  const isBot = createIsbotFromList(list.filter((record: string) => !patternsToRemove.has(record)));
  const userAgent = ctx.req.header('user-agent');

  if (userAgent && !isBot(userAgent)) await next();
  else errorResponse(ctx, 403, 'user_maybe_bot', 'warn');
};
