import type { MiddlewareHandler } from 'hono';
import { routePath } from 'hono/route';
import { appConfig } from 'shared';
import type { Env } from '#/core/context';
import { requestLogger } from '#/lib/pino';
import { isBenchTraffic } from '#/utils/logger';

/** Logs requests with timing, status, user and session id and the request id set before it. pino-pretty formats in dev. */
export const loggerMiddleware: MiddlewareHandler<Env> = async (ctx, next) => {
  const start = Date.now();
  const { url, method } = ctx.req;
  // The logger's `url` serializer scrubs tokens out of the path and query.
  const path = url.replace(appConfig.backendUrl, '');

  await next();

  const status = ctx.res.status;
  const responseTime = Date.now() - start;
  const { user, tenantId, requestId, session } = ctx.var;
  const userId = user?.id || 'na';
  const sessionId = session?.id;

  // Outside production, bench traffic logs its server errors alone.
  if (isBenchTraffic(userId, tenantId) && status < 500) return;

  const logData = { requestId, method, url: path, status, responseTime, userId, sessionId };
  // A message of the route (never the path, which can hold a token), the line's body where its logs are read.
  const message = `${method} ${routePath(ctx, -1)} ${status} ${responseTime} ms`;

  if (status >= 500) requestLogger.error(logData, message);
  else if (status >= 400) requestLogger.warn(logData, message);
  else requestLogger.info(logData, message);
};
