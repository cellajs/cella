import type { MiddlewareHandler } from 'hono';
import { middlewareLogger } from '#/pino-config';
import { nanoid } from '#/utils/nanoid';
import { logToExternal } from './external-logger';

const ANSI = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
};

export const loggerMiddleware: MiddlewareHandler = async (ctx, next) => {
  const start = Date.now();
  const { req, res } = ctx;
  const { url, method } = req;
  const path = new URL(url).pathname;

  // Generate logId and set it so we can use it to match error reports
  const reqId = nanoid();
  ctx.set('logId', reqId);

  const base = `reqId-${reqId} ${method}`;

  const incomingLogLine = `${base} ${path} - Incoming Request`;
  // Log incoming
  logTrace(incomingLogLine);

  await next();

  const duration = Date.now() - start;
  const coloredStatus = formatStatus(res.status);
  const message = getStatusMessage(res.status);

  const outgoingLogLine = `${base}  ${coloredStatus} ${path} (${duration}ms) - ${message}`;

  // Log outgoing
  logTrace(outgoingLogLine);
};

const logTrace = (message: string) => {
  middlewareLogger.trace(message);
  logToExternal('info', message);
};

// ANSI coloring for status codes
const formatStatus = (code: number): string => {
  if (code < 300) return `${ANSI.green}${code}${ANSI.reset}`;
  if (code < 500) return `${ANSI.yellow}${code}${ANSI.reset}`;
  return `${ANSI.red}${code}${ANSI.reset}`;
};

// Friendly message for status
const getStatusMessage = (code: number): string => {
  if (code >= 500) return 'Server Error';
  if (code >= 400) return 'Request Failed';
  return 'Request completed';
};
