import type { MiddlewareHandler } from 'hono';
import { appConfig } from 'shared';
import { requestLogger } from '#/lib/pino';
import { isBenchTraffic } from '#/utils/logger';

/** Logs requests with timing, status, user id and the request id set before it. pino-pretty formats in dev. */
export const loggerMiddleware: MiddlewareHandler = async (ctx, next) => {
  const start = Date.now();
  const { url, method } = ctx.req;
  // The logger's `url` serializer scrubs tokens out of the path and query.
  const path = url.replace(appConfig.backendUrl, '');

  await next();

  const status = ctx.res.status;
  const responseTime = Date.now() - start;
  const userId = ctx.get('user')?.id || 'na';

  // Suppress bench traffic logs in development (only log errors)
  if (isBenchTraffic(userId, ctx.get('tenantId')) && status < 500) return;

  const logData = { requestId: ctx.get('requestId'), method, url: path, status, responseTime, userId };

  if (status >= 500) requestLogger.error(logData);
  else if (status >= 400) requestLogger.warn(logData);
  else requestLogger.info(logData);
};
