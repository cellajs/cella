import type { MiddlewareHandler } from 'hono';
import { requestId } from 'hono/request-id';
import { appConfig } from 'shared';
import { requestLogger } from '#/pino';

/**
 * Request logging middleware.
 * Logs incoming/outgoing requests with timing, status codes, and user IDs.
 * Uses Hono's built-in requestId middleware for correlation.
 * Formatting is handled by pino-pretty in development.
 */
export const loggerMiddleware: MiddlewareHandler = async (ctx, next) => {
  // Use Hono's requestId middleware to generate/extract request ID
  await requestId()(ctx, async () => {});

  const start = Date.now();
  const { url, method } = ctx.req;
  const cleanUrl = url.replace(appConfig.backendUrl, '');
  const reqId = ctx.get('requestId');

  await next();

  const status = ctx.res.status;
  const responseTime = Date.now() - start;
  const userId = ctx.get('user')?.id || 'na';

  // Log structured data - pino-pretty handles formatting in development
  const logData = { requestId: reqId, method, url: cleanUrl, status, responseTime, userId };

  if (status >= 500) requestLogger.error(logData);
  else if (status >= 400) requestLogger.warn(logData);
  else requestLogger.info(logData);
};
