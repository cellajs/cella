import { createRoute, type z } from '@hono/zod-openapi';
import type { MiddlewareHandler } from 'hono';
import { type AccessScope, accessScopes } from 'shared';
import type { Env } from '#/core/context';
import {
  collectExtensionMiddleware,
  createMetadataExtensions,
  createSpecificationExtensions,
  type ExtensionPropId,
  type GuardContext,
  type SecurityRequirement,
  toolAction,
  type XMiddlewareHandler,
  type XRouteProps,
} from '#/core/openapi-extensions';
import { toKebabCase } from '#/core/openapi-helpers';
import { checksAuthoringRules, recordCustomVerb, recordDocumentedErrors, recordPatchBody } from '#/core/openapi-validation';
import { preconditionHeaders, preconditionResponses, preconditionsMiddleware, preconditionTarget } from '#/core/preconditions';
import { configSwitchGate } from '#/middlewares/config-switch';
import { readLimiter } from '#/middlewares/rate-limiter/limiters';
import { type ErrorCode, sharedErrorResponses } from '#/schemas/error-response-schemas';

/**
 * A route that answers 302 or 303 is a browser navigation: whatever refuses the request, the switch gate, a guard, a
 * limiter or the handler, answers with a redirect to the error page (`appErrorHandler`). Set before anything can
 * refuse; a handler may point it elsewhere.
 */
const errorPageMiddleware: MiddlewareHandler<Env> = async (ctx, next) => {
  ctx.set('errorPagePath', '/auth/error');
  await next();
};

/** Names the operation on the request before anything can refuse it, for the error handler's documented-status check where authoring rules are checked. */
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

/** A literal path segment, and a custom verb: lowercase kebab-case. */
const kebabCase = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/** Whether `operationId` leads with the verb's first word and holds its other words after it, in order: `mark-read` in `markNotificationsRead`. */
const namesVerb = (operationId: string, verb: string) => {
  const [first, ...rest] = verb.split('-');
  let from = first.length;
  return (
    operationId.startsWith(first) &&
    rest.every((word) => {
      const at = operationId.indexOf(capitalize(word), from);
      from = at + word.length;
      return at >= 0;
    })
  );
};

/**
 * Refuses at load a route that breaks the resource conventions of the API (aep.dev): an update is a `patch`, never a
 * `put`; a `get` or `delete` takes no body; a literal segment is lowercase kebab-case (the `-` wildcard parent and
 * `.well-known` aside); a custom method is the last segment `/~verb`, a kebab-case verb on a `post` or a bodiless `get`,
 * and its operationId leads with the verb.
 */
const assertRouteShape = (route: string, { method, path, operationId, request }: RouteOptions) => {
  const refuse = (problem: string): never => {
    throw new Error(`[routes] ${route}: ${problem}`);
  };
  if (method === 'put')
    refuse('put replaces a whole resource, which no route offers. Make it a patch, or a post custom method (/~verb) for an action.');
  if ((method === 'get' || method === 'delete') && request?.body)
    refuse(`a ${method} carries no request body. Move its input into the query, or make it a post custom method (/~verb).`);
  const segments = path.split('/').filter(Boolean);
  for (const [index, segment] of segments.entries()) {
    if (/^\{\w+\}$/.test(segment) || segment === '-' || segment === '.well-known') continue;
    if (segment.startsWith('~')) {
      const verb = segment.slice(1);
      if (index < segments.length - 1) refuse(`the custom method ${segment} is not the last segment. End the path with it.`);
      if (!kebabCase.test(verb)) refuse(`the custom verb "${verb}" is not lowercase kebab-case. Rename it, such as ~${toKebabCase(verb)}.`);
      if (method !== 'post' && method !== 'get') refuse(`the custom method ${segment} is a ${method}. Make it a post, or a get when it is safe.`);
      if (!namesVerb(operationId, verb)) {
        refuse(
          `the operationId does not lead with the verb of ${segment}. Rename the route key to start with "${verb.split('-')[0]}" and hold the verb's other words in order, as ~batch-delete takes batchDeleteOrganizations.`,
        );
      }
      continue;
    }
    if (segment.includes(':'))
      refuse(`the segment "${segment}" holds a colon. Declare a custom method as the last segment /~verb: the server routes :verb there.`);
    if (!kebabCase.test(segment)) refuse(`the segment "${segment}" is not lowercase kebab-case. Rename it, such as "${toKebabCase(segment)}".`);
  }
};

const firstSegment = (path: string) => path.split('/').find(Boolean) ?? '';

/**
 * Refuses at load a mount whose paths would let a param shadow a static path, and a mount path whose literal segments
 * are not lowercase kebab-case (a param is `:name`, `-` the wildcard parent). Mounts apply in registration order with
 * no phases, and a path whose first segment is a param would answer every request meant for a module mounted after
 * it: the mount path must start with a literal segment, and so must each route of an app mounted at `/`.
 * @param routePaths - The mounted app's own route paths, in Hono syntax (`/:id`).
 */
export const assertMountPath = (path: string, routePaths: string[]) => {
  const refuse = (problem: string): never => {
    throw new Error(`[routes] The mount path ${path}: ${problem}`);
  };
  if (firstSegment(path).startsWith(':')) {
    refuse(
      'it starts with a param, which would answer for the paths of every module mounted after it. Start it with a literal segment, such as /tenants/:tenantId.',
    );
  }
  if (firstSegment(path) === '') {
    const shadowing = routePaths.find((routePath) => firstSegment(routePath).startsWith(':'));
    if (shadowing) {
      refuse(
        `its route ${shadowing} starts with a param, which would answer for the paths of every module mounted after it. Give the route a literal first segment, or mount the module under one.`,
      );
    }
  }
  for (const segment of path.split('/').filter(Boolean)) {
    if (segment.startsWith(':') || segment === '-' || kebabCase.test(segment)) continue;
    refuse(`the segment "${segment}" is not lowercase kebab-case. Rename it, such as "${toKebabCase(segment)}".`);
  }
};

const pickShared = <C extends ErrorCode>(codes: Iterable<C>): Pick<typeof sharedErrorResponses, C> =>
  Object.fromEntries([...codes].map((code) => [code, sharedErrorResponses[code]])) as Pick<typeof sharedErrorResponses, C>;

/**
 * The error statuses a route's chain answers with before its handler, each with what answers it. The switch gate
 * answers 404 for a service or a feature flag and 400 for a sign-in method.
 */
const chainErrors = (config: RouteOptions, xMiddlewares: XMiddlewareHandler[], preconditioned: boolean): Map<ErrorCode, string> => {
  const owners = new Map<ErrorCode, string>();
  const claim = (code: ErrorCode, owner: string) => {
    if (!owners.has(code)) owners.set(code, owner);
  };
  if (config.request) claim(400, 'request validation');
  if (config.request?.body) claim(413, 'the body limit');
  if (config.xEnabledBy) claim('service' in config.xEnabledBy || 'feature' in config.xEnabledBy ? 404 : 400, 'xEnabledBy');
  if (preconditioned) for (const code of [400, 412] as const) claim(code, 'the preconditions');
  for (const mw of xMiddlewares) for (const code of mw.__errors ?? []) claim(code, mw.name);
  return owners;
};

/**
 * Wraps `createRoute` with extension middleware, documented in OpenAPI as `x-*` properties. A request passes, in this
 * order: the error page (a 302 or 303 route), the config switch gate (`xEnabledBy`), `xGuard`, `xRateLimiter`, the
 * preconditions of a route for one channel or product (`preconditionTarget`: entity tags and `If-Match`), the
 * route's own `middleware`, then validation and the handler. The switch needs no caller, so a route that is off
 * answers before any guard shows how it authenticates; `middleware` runs after the guards and may read the actor.
 * A GET route that declares no limiter takes `readLimiter`, and a limiter a guard runs itself (`limiters`) is
 * documented on every route that lists the guard.
 * The route documents the error statuses its chain answers with (`chainErrors`) beside its own responses, where
 * `errors()` lists what the handler throws; a status the route declares keeps the route's own response. Where
 * authoring rules are checked, `errors()` of a status the chain already answers is refused at load, so every listed
 * status has one owner, and the error handler answers an undocumented status as a 500 in tests.
 * @link https://github.com/honojs/middleware/tree/main/packages/zod-openapi#configure-middleware-for-each-endpoint
 */
export const createXRoute = <P extends string, R extends Omit<RouteOptions, 'path'> & { path: P }>(config: R): XRoute<R> => {
  const route = `${config.operationId} (${config.method} ${config.path})`;
  if (checksAuthoringRules) assertRouteShape(route, config);
  const verb = /\/~([^/]+)$/.exec(config.path)?.[1];
  if (verb) recordCustomVerb(verb);
  const patchMedia = config.method === 'patch' ? config.request?.body?.content['application/json'] : undefined;
  if (patchMedia && 'schema' in patchMedia) recordPatchBody(config.operationId, patchMedia.schema);
  // A read declares a limiter only where its own budget differs from the read pace.
  const limited = config.method === 'get' && !config.xRateLimiter?.length ? { ...config, xRateLimiter: [readLimiter] } : config;
  const extensionMiddleware = collectExtensionMiddleware(limited);
  const existing = [config.middleware ?? []].flat();
  const target = preconditionTarget(config);

  // The operation name first, then the error page, so every refusal finds both, the switch gate's included.
  const operation = checksAuthoringRules ? [operationMiddleware(config.operationId)] : [];
  const errorPage = '302' in config.responses || '303' in config.responses ? [errorPageMiddleware] : [];
  const switchGate = config.xEnabledBy ? [configSwitchGate(config.xEnabledBy)] : [];
  const preconditions = target ? [preconditionsMiddleware(target)] : [];
  const middleware = [...operation, ...errorPage, ...switchGate, ...extensionMiddleware, ...preconditions, ...existing];

  // Each marked middleware, then the limiters a guard runs itself, so the document lists them and their errors.
  const xMiddlewares = middleware
    .filter((mw): mw is XMiddlewareHandler => '__extensionType' in mw && typeof mw.__extensionType === 'string')
    .flatMap((mw) => [mw, ...(mw.__limiters ?? [])]);
  assertGuardOrder(route, xMiddlewares);
  const specificationExtensions = createSpecificationExtensions((key) =>
    xMiddlewares.filter((mw) => mw.__extensionType === key && mw.name).map((mw) => mw.name),
  );

  const owners = chainErrors(config, xMiddlewares, !!target);
  for (const [code, owner] of owners) {
    if (checksAuthoringRules && config.responses[code] === sharedErrorResponses[code]) {
      throw new Error(`[routes] ${route}: errors(${code}) repeats the ${code} that ${owner} answers with. Drop it.`);
    }
  }
  const responses = { ...pickShared(owners.keys()), ...config.responses, ...(target && preconditionResponses(target, config.responses[200])) };
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
  const { xGuard: _guard, xRateLimiter: _rateLimiter, xTool: _tool, xEnabledBy: _enabledBy, xScope: _scope, ...routeConfig } = config;
  const parameters = target ? { parameters: [...(config.parameters ?? []), ...preconditionHeaders(target)] } : {};
  const cleanConfig = { ...routeConfig, ...parameters, ...createMetadataExtensions(config) };

  return createRoute({ security, ...cleanConfig, responses, middleware, ...specificationExtensions });
};

type JsonResponse<S extends z.ZodType> = { description: string; content: { 'application/json': { schema: S; example?: z.output<S> } } };

/**
 * A JSON response: `ctx.json(data, status)` is typed from `schema`. Give `example` only where this response differs
 * from the schema's own example or where the schema is inline and has none.
 * @param description A label of a few words, then optionally a blank line and a detail the docs show when the row opens.
 */
export const json = <S extends z.ZodType>(description: string, schema: S, example?: z.output<S>): JsonResponse<S> => ({
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
 * both ahead of the draft's own keys so the document keeps its key order.
 */
export const createXRoutes = <T extends Record<string, Draft>>(tags: string[], drafts: T): XRoutes<T> =>
  Object.fromEntries(Object.entries(drafts).map(([key, draft]) => [key, createXRoute({ operationId: key, tags, ...draft })])) as XRoutes<T>;
