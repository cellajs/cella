import { appConfig, type Severity } from 'shared';
import { BENCH_TENANT_ID, BENCH_UUID_PREFIX } from 'shared/bench-identity';
import type { Env } from '#/core/context';
import { eventLogger } from '#/lib/pino';

const isProduction = appConfig.mode === 'production';

/** Check if traffic originates from bench/load testing (dev only). */
export const isBenchTraffic = (userId?: string, tenantId?: string) => {
  if (isProduction) return false;
  return tenantId === BENCH_TENANT_ID || userId?.startsWith(BENCH_UUID_PREFIX);
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
  // Always log errors; for everything else, suppress bench traffic.
  const isError = severity === 'error' || severity === 'fatal';
  if (!isError && ctx?.var && isBenchTraffic(ctx.var.userId, ctx.var.tenantId)) return;

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
