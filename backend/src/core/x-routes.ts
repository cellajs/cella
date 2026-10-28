import { createRoute, type z } from '@hono/zod-openapi';
import type { MiddlewareHandler } from 'hono';
import { type AccessScope, accessScopes } from 'shared';
import type { Env } from '#/core/context';
import {
  collectExtensionMiddleware,
  createMetadataExtensions,
  createSpecificationExtensions,
  type ExtensionPropId,
  extensionPropIds,
  type GuardContext,
  type SecurityRequirement,
  toolAction,
  type XMiddlewareHandler,
  type XRouteProps,
} from '#/core/openapi-extensions';
import { checksAuthoringRules, recordDocumentedErrors } from '#/core/openapi-validation';
import { configSwitchGate } from '#/middlewares/config-switch';
import { type ErrorCode, sharedErrorResponses } from '#/schemas/error-response-schemas';

/**
 * A route that answers 302 is a browser navigation: whatever refuses the request, the switch gate, a guard, a limiter
 * or the handler, answers with a redirect to the error page (`appErrorHandler`). Set before anything can refuse; a
 * handler may point it elsewhere.
 */
const errorPageMiddleware: MiddlewareHandler<Env> = async (ctx, next) => {
  ctx.set('errorPagePath', '/auth/error');
  await next();
};

/** Names the operation on the request before anything can refuse it, for the error handler's documented-status check. */
const operationMiddleware =
  (operationId: string): MiddlewareHandler<Env> =>
  async (ctx, next) => {
    ctx.set('operationId', operationId);
    await next();
  };

type RouteOptions = Parameters<typeof createRoute>[0] & XRouteProps & { operationId: string };

/** A session is never narrowed, so of a route's security schemes only the key and the token carry its scope. */
const scopedSchemes = new Set(['apiKey', 'oauth2']);
const withScope = (requirement: SecurityRequirement, scope: AccessScope): SecurityRequirement =>
  Object.fromEntries(Object.entries(requirement).map(([scheme, scopes]) => [scheme, scopedSchemes.has(scheme) ? [scope] : scopes]));

/**
 * The route `createXRoute` makes of a config: its own responses plus the shared error responses for the statuses it
 * leaves out. The type keeps every error status, which types only a handler's `ctx.json(body, status)`; the document
 * lists the statuses the route's chain and handler answer with.
 */
type XRoute<R extends Draft> = ReturnType<
  typeof createRoute<R['path'], Omit<R, ExtensionPropId> & { responses: Omit<typeof sharedErrorResponses, keyof R['responses']> }>
>;

/** Refuses a route at load where a guard reads context (`requires`) that no guard before it provides. */
const assertGuardOrder = (route: string, xMiddlewares: XMiddlewareHandler[]) => {
  const provided = new Set<GuardContext>();
  for (const mw of xMiddlewares) {
    const missing = mw.__requires?.filter((key) => !provided.has(key)) ?? [];
    if (missing.length) {
      throw new Error(
        `[routes] ${route}: ${mw.name} reads the ${missing.join(' and ')} that an earlier guard sets. Put that guard before it in xGuard.`,
      );
    }
    for (const key of mw.__provides ?? []) provided.add(key);
  }
};

/** The shared error responses of `codes`, keyed by status. */
const pickShared = <C extends ErrorCode>(codes: Iterable<C>): Pick<typeof sharedErrorResponses, C> =>
  Object.fromEntries([...codes].map((code) => [code, sharedErrorResponses[code]])) as Pick<typeof sharedErrorResponses, C>;

/**
 * The error statuses a route's chain answers with before its handler, each with what answers it: request validation
 * (400) and the body limit (413) for a route with a request, the switch gate (`xEnabledBy`: 404 for a service, 400 for
 * a sign-in method), and what each marked middleware declares in `errors`.
 */
const chainErrors = (config: RouteOptions, xMiddlewares: XMiddlewareHandler[]): Map<ErrorCode, string> => {
  const owners = new Map<ErrorCode, string>();
  const claim = (code: ErrorCode, owner: string) => {
    if (!owners.has(code)) owners.set(code, owner);
  };
  if (config.request) claim(400, 'request validation');
  if (config.request?.body) claim(413, 'the body limit');
  if (config.xEnabledBy) claim('service' in config.xEnabledBy ? 404 : 400, 'xEnabledBy');
  for (const mw of xMiddlewares) for (const code of mw.__errors ?? []) claim(code, mw.name);
  return owners;
};

/**
 * Wraps `createRoute` with extension middleware, documented in OpenAPI as `x-*` properties. A request passes, in this
 * order: the error page (a 302 route), the config switch gate (`xEnabledBy`), `xGuard`, `xRateLimiter`, `xCache`, the
 * route's own `middleware`, then validation and the handler. The switch needs no caller, so a route that is off
 * answers before any guard shows how it authenticates; `middleware` runs after the guards and may read the actor.
 * The route documents the error statuses its chain answers with (`chainErrors`) beside its own responses, where
 * `errors()` lists what the handler throws; a status the route declares keeps the route's own response. Where
 * authoring rules are checked, `errors()` of a status the chain already answers is refused at load, so every listed
 * status has one owner, and the error handler answers an undocumented status as a 500 in tests.
 * @link https://github.com/honojs/middleware/tree/main/packages/zod-openapi#configure-middleware-for-each-endpoint
 */
export const createXRoute = <P extends string, R extends Omit<RouteOptions, 'path'> & { path: P }>(config: R): XRoute<R> => {
  const route = `${config.operationId} (${config.method} ${config.path})`;
  const extensionMiddleware = collectExtensionMiddleware(config);
  const existing = [config.middleware ?? []].flat();

  // The operation name first, then the error page, so every refusal finds both, the switch gate's included.
  const errorPage = '302' in config.responses ? [errorPageMiddleware] : [];
  const switchGate = config.xEnabledBy ? [configSwitchGate(config.xEnabledBy)] : [];
  const middleware = [operationMiddleware(config.operationId), ...errorPage, ...switchGate, ...extensionMiddleware, ...existing];

  const xMiddlewares = middleware.filter(
    (mw): mw is XMiddlewareHandler => '__extensionType' in mw && typeof (mw as XMiddlewareHandler).__extensionType === 'string',
  );
  assertGuardOrder(route, xMiddlewares);
  const specificationExtensions = createSpecificationExtensions((key) =>
    xMiddlewares.filter((mw) => mw.__extensionType === key && mw.name).map((mw) => mw.name),
  );

  const owners = chainErrors(config, xMiddlewares);
  if (checksAuthoringRules) {
    for (const [code, owner] of owners) {
      if (config.responses[code] === sharedErrorResponses[code]) {
        throw new Error(`[routes] ${route}: errors(${code}) repeats the ${code} that ${owner} answers with. Drop it.`);
      }
    }
  }
  const responses = { ...pickShared(owners.keys()), ...config.responses };
  recordDocumentedErrors(
    config.operationId,
    Object.keys(responses)
      .map(Number)
      .filter((status) => status >= 400 && status < 500),
  );

  // Security follows the guard: the first guard that declares schemes decides; a route with none is cookie-only.
  const guardSecurity = xMiddlewares.find((mw) => mw.__security !== undefined)?.__security ?? [{ cookieAuth: [] }];
  const scope = config.xScope ?? (config.xTool && accessScopes.required(config.xTool.entity, toolAction(config.method)));
  const security = scope ? guardSecurity.map((requirement) => withScope(requirement, scope)) : guardSecurity;

  // An MCP call carries the caller's access token and nothing else, so a tool route whose guards take none can never run.
  const accepted = config.security ?? security;
  if (config.xTool && accepted.length && !accepted.some((requirement) => 'oauth2' in requirement)) {
    const schemes = accepted.flatMap((requirement) => Object.keys(requirement)).join(', ');
    throw new Error(
      `[MCP] The tool route ${route} takes no access token: its guards accept ${schemes} only. ` +
        'Guard it with actorGuard or serviceGuard, or remove xTool.',
    );
  }

  // Extension props leave the route config: middleware runs, metadata returns under its `x-*` key, `xScope` went into security.
  const cleanConfig = {
    ...Object.fromEntries(Object.entries(config).filter(([key]) => !extensionPropIds.includes(key))),
    ...createMetadataExtensions(config),
  } as Omit<R, ExtensionPropId>;

  return createRoute({ security, ...cleanConfig, responses, middleware, ...specificationExtensions });
};

type JsonResponse<S extends z.ZodType> = {
  description: string;
  content: { 'application/json': { schema: S; example?: unknown } };
};

/**
 * A JSON response: `ctx.json(data, status)` is typed from `schema`. Give `example` only where this response differs
 * from the schema's own example (development and tests refuse a copy of it) or where the schema is inline and has none.
 */
export const json = <S extends z.ZodType>(description: string, schema: S, example?: unknown): JsonResponse<S> => ({
  description,
  content: { 'application/json': example === undefined ? { schema } : { schema, example } },
});

/**
 * The shared error responses of the statuses a route's handler throws, to spread into `responses` beside the route's
 * own. The statuses its guards, limiters, switch and validation answer with are documented without it.
 */
export const errors = <C extends ErrorCode>(...codes: C[]): Pick<typeof sharedErrorResponses, C> => pickShared(codes);

type JsonBody<S extends z.ZodType> = { required: true; content: { 'application/json': { schema: S; example?: unknown } } };

/**
 * A required JSON request body: `ctx.req.valid('json')` is typed from `schema`. An `example` shows a caller a valid body;
 * in development and tests it must parse with `schema` when the route module loads.
 */
export const jsonBody = <S extends z.ZodType>(schema: S, example?: z.input<S>): JsonBody<S> => {
  if (example === undefined) return { required: true, content: { 'application/json': { schema } } };
  const parsed = checksAuthoringRules ? schema.safeParse(example) : undefined;
  if (parsed && !parsed.success) throw new Error(`A request body example does not match its schema: ${parsed.error.message}`);
  return { required: true, content: { 'application/json': { schema, example } } };
};

/** Route options before `createXRoutes` fills in `operationId` (the key) and `tags` (the module's). */
type DraftOptions = Omit<RouteOptions, 'path' | 'operationId' | 'tags'> & { operationId?: string; tags?: string[] };

type Draft = DraftOptions & { path: string };

type XRoutes<T extends Record<string, Draft>> = { [K in keyof T]: XRoute<T[K]> };

/** One route of a `createXRoutes` module: keeps its literal types. */
export const xRoute = <P extends string, R extends DraftOptions & { path: P }>(config: R) => config;

/**
 * Finishes a module's routes with `createXRoute`: `operationId` defaults to the route's key and `tags` to the module's,
 * set before `summary` so the document keeps its key order.
 */
export const createXRoutes = <T extends Record<string, Draft>>(tags: string[], drafts: T): XRoutes<T> =>
  Object.fromEntries(
    Object.entries(drafts).map(([key, draft]) => {
      const entries: [string, unknown][] = Object.entries(draft);
      if (!draft.tags) {
        const summary = entries.findIndex(([name]) => name === 'summary');
        entries.splice(summary === -1 ? entries.length : summary, 0, ['tags', tags]);
      }
      if (!draft.operationId) entries.unshift(['operationId', key]);
      return [key, createXRoute(Object.fromEntries(entries) as Parameters<typeof createXRoute>[0])];
    }),
  ) as XRoutes<T>;
