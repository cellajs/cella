import { createRoute } from '@hono/zod-openapi';
import type { MiddlewareHandler } from 'hono';
import { appConfig } from 'shared';
import { AppError } from '#/core/error';
import { registerMcpTool } from '#/core/mcp-tool-registry';
import type { ServiceGate, StrategyGate, XMiddlewareHandler } from '#/core/openapi-extensions';
import {
  collectExtensionMiddleware,
  createSpecificationExtensions,
  type ExtensionPropId,
  getExtensionPropIds,
  type XMiddlewareOptions,
  type XToolMetadata,
} from '#/core/openapi-extensions';

/** Runs before guards so a disabled service 404s without exposing auth behavior. Read per request. */
const createServiceGate =
  (service: ServiceGate): MiddlewareHandler =>
  async (_ctx, next) => {
    if (appConfig.services[service]?.enabled === false) throw new AppError(404, 'route_not_found', 'warn');
    await next();
  };

/**
 * Refuses an auth route while its sign-in method is off, before any guard runs, so no handler can forget the check.
 * Read per request: the enabled strategies can change at runtime (tests switch them).
 */
const createStrategyGate =
  (gate: Exclude<StrategyGate, null>): MiddlewareHandler =>
  async (ctx, next) => {
    if (typeof gate === 'object') {
      const provider = gate.oauth;
      if (
        !appConfig.enabledAuthStrategies.includes('oauth') ||
        !appConfig.enabledOAuthProviders.some((p) => p === provider)
      ) {
        // Provider routes are browser navigations: the error page explains the refusal.
        throw new AppError(400, 'unsupported_oauth', 'error', {
          willRedirect: appConfig.mode !== 'test',
          meta: { errorPagePath: '/auth/error', strategy: provider },
        });
      }
    } else {
      const strategy = typeof gate === 'function' ? gate(ctx) : gate;
      if (strategy && !appConfig.enabledAuthStrategies.includes(strategy)) {
        throw new AppError(400, 'forbidden_strategy', 'error', { meta: { strategy } });
      }
    }
    await next();
  };

const strategyLabel = (gate: StrategyGate): string => {
  if (gate === null) return 'none';
  if (typeof gate === 'function') return 'per-request';
  return typeof gate === 'object' ? `oauth:${gate.oauth}` : gate;
};

type RouteOptions = Parameters<typeof createRoute>[0] & XMiddlewareOptions & { operationId: string };

type Route<P extends string, R extends Omit<RouteOptions, 'path' | 'x-tool' | 'request'> & { path: P }> = ReturnType<
  typeof createRoute<P, Omit<R, ExtensionPropId>>
>;

/**
 * Wraps `createRoute` with extension middleware (xGuard, xRateLimiter), documented in OpenAPI as `x-*` properties.
 * @link https://github.com/honojs/middleware/tree/main/packages/zod-openapi#configure-middleware-for-each-endpoint
 */
export const createXRoute = <
  P extends string,
  Req extends RouteOptions['request'],
  R extends Omit<RouteOptions, 'path' | 'x-tool' | 'request'> & { path: P },
>(
  // `x-tool.execute` is typed from this route's own `request`, so an operation receives the request parts it expects.
  config: R & { request?: Req; 'x-tool'?: XToolMetadata<Req> },
): Route<P, R & { request?: Req }> => {
  const extensionMiddleware = collectExtensionMiddleware(config);
  const existing = config.middleware
    ? Array.isArray(config.middleware)
      ? config.middleware
      : [config.middleware]
    : [];

  // Service gate (from declarative `x-service`) runs first so disabled services 404 before guards; the strategy gate next.
  const service = config['x-service'] as ServiceGate | undefined;
  const serviceGate = service ? [createServiceGate(service)] : [];
  const strategy = config['x-strategy'] as StrategyGate | undefined;
  const strategyGate = strategy ? [createStrategyGate(strategy)] : [];
  const middleware = [...serviceGate, ...strategyGate, ...extensionMiddleware, ...existing];

  const xMiddlewares = middleware.filter(
    (mw): mw is XMiddlewareHandler =>
      '__extensionType' in mw && typeof (mw as XMiddlewareHandler).__extensionType === 'string',
  );
  const specificationExtensions = createSpecificationExtensions((key) =>
    xMiddlewares.filter((mw) => mw.__extensionType === key && mw.name).map((mw) => mw.name),
  );

  // Security follows the guard: the first guard that declares schemes decides; a route with none is cookie-only.
  const security = xMiddlewares.find((mw) => mw.__security !== undefined)?.__security ?? [{ cookieAuth: [] }];

  // Strip extension props to prevent them leaking as null in OpenAPI
  const extensionPropIds = getExtensionPropIds();
  const cleanConfig = Object.fromEntries(
    Object.entries(config).filter(([key]) => !extensionPropIds.includes(key)),
  ) as Omit<R, ExtensionPropId>;

  // The spec names the strategy as a label: a per-request gate is code, never document content.
  if (strategy !== undefined) Object.assign(cleanConfig, { 'x-strategy': strategyLabel(strategy) });

  // A route carrying `x-tool` registers itself as an MCP tool; the spec keeps the metadata, never `execute`.
  const tool = config['x-tool'];
  if (tool?.enabled) {
    registerMcpTool({ operationId: config.operationId, method: config.method, request: config.request }, tool);
    const { execute: _execute, ...spec } = tool;
    Object.assign(cleanConfig, { 'x-tool': spec });
  }

  return createRoute({
    security,
    ...cleanConfig,
    middleware,
    ...specificationExtensions,
  });
};
