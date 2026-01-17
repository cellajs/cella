import { appConfig } from 'config';
import type { MiddlewareHandler } from 'hono';
import { requestLogger } from '#/pino-config';
import { nanoid } from '#/utils/nanoid';

const ANSI = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  grey: '\x1b[90m',
};

// In production, we directly return JSON
const isProduction = appConfig.mode === 'production';

export const loggerMiddleware: MiddlewareHandler = async (ctx, next) => {
  const start = Date.now();
  const { url, method } = ctx.req;

  const cleanUrl = url.replace(appConfig.backendUrl, '');

  // Generate logId/requestId for tracing
  const logId = nanoid();
  ctx.set('logId', logId);

  // Log incoming request (before next)
  const base = `${ANSI.grey}${logId}${ANSI.reset} ${method}`;
  if (isProduction) {
    logTrace({ logId, method, url: cleanUrl });
  } else {
    const incomingLogLine = `${base} ${cleanUrl}`;
    logTrace(incomingLogLine);
  }

  await next();

  const responseTime = Date.now() - start;
  const userId = ctx.get('user')?.id || 'na';

  // Log JSON
  if (isProduction) return logTrace({ logId, userId, method, url: cleanUrl, status: ctx.res.status, responseTime });

  // Log human-readable
  const coloredStatus = formatStatus(ctx.res.status);
  const errorText = getErrorText(ctx.res.status);
  const outgoingLogLine = `${base} ${coloredStatus} ${cleanUrl} (${responseTime}ms) ${ANSI.grey}@${userId}${ANSI.reset} ${errorText}`;
  logTrace(outgoingLogLine);
};

const logTrace = (log: { [key: string]: string | number } | string) => {
  if (typeof log === 'string') return requestLogger.info(log);
  if (log.status && Number(log.status) >= 500) return requestLogger.error(log);
  if (log.status && Number(log.status) >= 400) return requestLogger.warn(log);
  return requestLogger.info(log);
};

// ANSI coloring for status codes
const formatStatus = (code: number): string => {
  if (code < 300) return `${ANSI.green}${code}${ANSI.reset}`;
  if (code < 500) return `${ANSI.yellow}${code}${ANSI.reset}`;
  return `${ANSI.red}${code}${ANSI.reset}`;
};

// Friendly error text based on status
const getErrorText = (code: number): string => {
  if (code >= 500) return ' - server error';
  if (code >= 400) return ' - request failed';
  return '';
};
