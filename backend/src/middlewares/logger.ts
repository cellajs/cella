import type { MiddlewareHandler } from 'hono';
import { appConfig } from 'shared';
import type { Env } from '#/core/context';
import { requestLogger } from '#/lib/pino';
import { isBenchTraffic } from '#/utils/logger';

/**
 * Logs requests with timing, status, user and session id and the request id set before it; a request made through an impersonation
 * also names its admin. pino-pretty formats in dev.
 */
export const loggerMiddleware: MiddlewareHandler<Env> = async (ctx, next) => {
  const start = Date.now();
  const { url, method } = ctx.req;
  // The logger's `url` serializer scrubs tokens out of the path and query.
  const path = url.replace(appConfig.backendUrl, '');

  await next();

  const status = ctx.res.status;
  const responseTime = Date.now() - start;
  const { user, tenantId, impersonator, requestId, sessionId } = ctx.var;
  const userId = user?.id || 'na';

  // Outside production, bench traffic logs its server errors alone.
  if (isBenchTraffic(userId, tenantId) && status < 500) return;

  const impersonatorId = impersonator?.id;
  const logData = { requestId, method, url: path, status, responseTime, userId, sessionId, ...(impersonatorId && { impersonatorId }) };

  if (status >= 500) requestLogger.error(logData);
  else if (status >= 400) requestLogger.warn(logData);
  else requestLogger.info(logData);
};
