import { AsyncLocalStorage } from 'node:async_hooks';
import { appConfig, type Severity } from 'shared';
import { BENCH_TENANT_ID, BENCH_UUID_PREFIX } from 'shared/bench-identity';
import type { LogMeta } from 'shared/pino';
import type { Env } from '#/core/context';
import { baseLog } from '#/lib/pino';

const isProduction = appConfig.mode === 'production';

/** Check if traffic originates from bench/load testing (dev only). */
export const isBenchTraffic = (userId?: string, tenantId?: string) => {
  if (isProduction) return false;
  return tenantId === BENCH_TENANT_ID || userId?.startsWith(BENCH_UUID_PREFIX);
};

/** Ambient log context: the live Hono ctx, or a synthetic { var } for worker jobs. */
export type LogContext = {
  var: Partial<Pick<Env['Variables'], 'tenantId' | 'userId' | 'organizationId' | 'requestId'>>;
} | null;

const logContextStorage = new AsyncLocalStorage<LogContext>();

/**
 * Run `fn` with ambient log context: the log facade binds tenant/user/org/request ids
 * from it without call sites passing ctx. Installed per-request by contextMiddleware;
 * worker jobs can wrap their execution with a synthetic context.
 *
 * Ambient context follows await chains, not event emitters or timers. Code invoked
 * from detached callbacks logs without ids, same as code outside any request.
 */
export const runWithLogContext = <T>(ctx: LogContext, fn: () => T): T => logContextStorage.run(ctx, fn);

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

const logAt =
  (severity: Severity) =>
  (msg: string, meta?: LogMeta): void => {
    // Reads the LIVE ctx at log time, so vars set by guards after the context
    // middleware (userId, tenantId, organizationId) are picked up.
    const ctx = logContextStorage.getStore() ?? null;

    // Always log errors; for everything else, suppress bench traffic.
    const isError = severity === 'error' || severity === 'fatal';
    if (!isError && ctx?.var && isBenchTraffic(ctx.var.userId, ctx.var.tenantId)) return;

    baseLog[severity](msg, { ...extractBase(ctx), ...meta });
  };

/** Log facade: `log.warn('msg', { err, ...meta })`, binding ids from the ambient request/job context. */
export const log = {
  trace: logAt('trace'),
  debug: logAt('debug'),
  info: logAt('info'),
  warn: logAt('warn'),
  error: logAt('error'),
  fatal: logAt('fatal'),
};
