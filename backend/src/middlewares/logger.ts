import type { MiddlewareHandler } from 'hono';
import { requestId } from 'hono/request-id';
import { appConfig } from 'shared';
import { requestLogger } from '#/lib/pino';
import { isBenchTraffic } from '#/utils/logger';
import { scrubUrl } from '#/utils/scrub-url';

// Instantiate requestId middleware once at module scope to reuse it across requests.
const requestIdMiddleware = requestId();

/** Logs requests with timing, status, and user id, correlated by Hono's requestId. pino-pretty formats in dev. */
export const loggerMiddleware: MiddlewareHandler = async (ctx, next) => {
  await requestIdMiddleware(ctx, async () => {});

  const start = Date.now();
  const { url, method } = ctx.req;
  const cleanUrl = scrubUrl(url.replace(appConfig.backendUrl, ''));
  const reqId = ctx.get('requestId');

  await next();

  const status = ctx.res.status;
  const responseTime = Date.now() - start;
  const userId = ctx.get('user')?.id || 'na';

  // Suppress bench traffic logs in development (only log errors)
  if (isBenchTraffic(userId, ctx.get('tenantId')) && status < 500) return;

  const logData = { requestId: reqId, method, url: cleanUrl, status, responseTime, userId };

  if (status >= 500) requestLogger.error(logData);
  else if (status >= 400) requestLogger.warn(logData);
  else requestLogger.info(logData);
};
