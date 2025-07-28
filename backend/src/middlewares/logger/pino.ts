import type { MiddlewareHandler } from 'hono';
import { externalLogger } from '#/middlewares/logger/external-logger';
import { middlewareLogger } from '#/pino-config';
import { nanoid } from '#/utils/nanoid';

const ANSI = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
};

export const pinoMiddleware: MiddlewareHandler = async (ctx, next) => {
  const start = Date.now();

  // Use child logger to attach request context if needed
  const reqId = nanoid(); // or incremented counter
  ctx.set('logId', reqId);

  await next();

  const duration = Date.now() - start;
  const statusCode = ctx.res.status;
  const path = new URL(ctx.req.url).pathname;

  const coloredStatus = getStatusColor(statusCode);
  const message = getMessage(statusCode);

  const logLine = `reqId-${reqId} ${ctx.req.method} ${coloredStatus} ${path} (${duration}ms) - ${message}`;

  middlewareLogger.trace(logLine);

  if (externalLogger) externalLogger.info(logLine);
};

const getStatusColor = (code: number) => {
  if (code < 300) return `${ANSI.green}${code}${ANSI.reset}`;
  if (code < 500) return `${ANSI.yellow}${code}${ANSI.reset}`;
  return `${ANSI.red}${code}${ANSI.reset}`;
};

const getMessage = (code: number) => {
  if (code >= 500) return 'Server Error';
  if (code >= 400) return 'Request Failed';
  return 'Request completed';
};
