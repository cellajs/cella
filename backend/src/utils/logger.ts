import { AsyncLocalStorage } from 'node:async_hooks';
import type { Context } from 'hono';
import { appConfig, type Severity } from 'shared';
import type { LogMeta } from 'shared/pino';
import { benchTenantId, benchUuidPrefix } from 'shared/utils/bench-identity';
import type { Env } from '#/core/context';
import { baseLog } from '#/lib/pino';

const isProduction = appConfig.mode === 'production';

/** Check if traffic originates from bench/load testing (dev only). */
export const isBenchTraffic = (userId?: string, tenantId?: string): boolean => {
  if (isProduction) return false;
  return tenantId === benchTenantId || userId?.startsWith(benchUuidPrefix) === true;
};

const requestStorage = new AsyncLocalStorage<Context<Env>>();

/**
 * Binds the request to everything its handler runs, installed per request by the global middleware chain: the log
 * facade reads its ids, `ambientRequest` the request itself. It follows await chains, not event emitters or timers, so
 * code invoked from detached callbacks runs outside it.
 */
export const runWithLogContext = <T>(ctx: Context<Env>, fn: () => T): T => requestStorage.run(ctx, fn);

/** The request this code runs in; null in a job, a CDC listener or a detached callback. */
export const ambientRequest = (): Context<Env> | null => requestStorage.getStore() ?? null;

const extractBase = (ctx: Context<Env> | null) => {
  if (!ctx) return {};
  // Pino leaves undefined values out of the line, so unset ids need no guard.
  const { tenantId, user, organizationId, requestId, session } = ctx.var;
  return { tenantId, userId: user?.id, organizationId, requestId, sessionId: session?.id };
};

const logAt =
  (severity: Severity) =>
  (msg: string, meta?: LogMeta): void => {
    // Read at log time, so ids set by guards after the context middleware are picked up.
    const ctx = ambientRequest();

    // Always log errors; for everything else, suppress bench traffic.
    const isError = severity === 'error' || severity === 'fatal';
    if (!isError && ctx && isBenchTraffic(ctx.var.user?.id, ctx.var.tenantId)) return;

    baseLog[severity](msg, { ...extractBase(ctx), ...meta });
  };

/** Log facade: `log.warn('msg', { err, ...meta })`, binding ids from the ambient request. */
export const log = {
  trace: logAt('trace'),
  debug: logAt('debug'),
  info: logAt('info'),
  warn: logAt('warn'),
  error: logAt('error'),
  fatal: logAt('fatal'),
};
