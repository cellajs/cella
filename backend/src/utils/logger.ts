import { appConfig, type Severity } from 'shared';
import type { Env } from '#/core/context';
import { eventLogger } from '#/lib/pino';

const isProduction = appConfig.mode === 'production';

const BENCH_TENANT_ID = 'xbench';

/** Check if traffic originates from bench/load testing */
export const isBenchTraffic = (url?: string, userId?: string) => {
  if (isProduction) return false;
  return url?.includes(`/${BENCH_TENANT_ID}/`) || userId?.startsWith('xbench-');
};

/** Narrow context type for logging — accepts full Hono ctx or any object with matching .var shape. */
export type LogContext = {
  var: Partial<Pick<Env['Variables'], 'tenantId' | 'userId' | 'organizationId' | 'requestId'>>;
} | null;

const extractBase = (ctx: LogContext) => {
  if (!ctx?.var) return {};
  const { tenantId, userId, organizationId, requestId } = ctx.var;
  return {
    ...(tenantId && { tenantId }),
    ...(userId && { userId }),
    ...(organizationId && { organizationId }),
    ...(requestId && { requestId }),
  };
};

export const logEvent = (ctx: LogContext, severity: Severity, msg: string, meta?: object): void => {
  // Suppress bench traffic logs (except errors)
  if (severity !== 'error' && severity !== 'fatal' && ctx?.var && isBenchTraffic(undefined, ctx.var.userId)) return;

  eventLogger[severity]({ ...extractBase(ctx), ...(meta ?? {}), msg });
};

export const logError = (ctx: LogContext, msg: string, error: Error | unknown, meta?: object): void => {
  const base = extractBase(ctx);

  // If not an instance of Error, log as unknown
  if (!(error instanceof Error)) {
    if (!isProduction) eventLogger.error(error);
    else eventLogger.error({ ...base, ...(meta ?? {}), msg, error });
    return;
  }

  const errorDetails = {
    errorName: error.name,
    errorMessage: error.message,
    errorStack: error.stack,
  };

  if (!isProduction) eventLogger.error(error);
  else eventLogger.error({ ...base, ...(meta ?? {}), errorDetails, msg });
};

export const getNodeLoggerLevel = (severity: Severity): 'error' | 'warn' | 'info' | 'debug' => {
  // Pino standard levels: fatal=60, error=50, warn=40, info=30, debug=20, trace=10
  const levelValues = { fatal: 60, error: 50, warn: 40, info: 30, debug: 20, trace: 10 };
  const severityValue = levelValues[severity];
  if (severityValue >= 50) return 'error';
  if (severityValue >= 40) return 'warn';
  if (severityValue >= 30) return 'info';
  return 'debug';
};
