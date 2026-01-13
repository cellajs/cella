import { getRefId } from '@asteasolutions/zod-to-openapi';
import { createRoute } from '@hono/zod-openapi';
import type { MiddlewareHandler } from 'hono';
import type { ZodType } from 'zod';
import type { Env } from '#/lib/context';
import { getSpecificationExtensions } from '#/lib/openapi-describer';
import { isPublicAccess } from '#/middlewares/guard/is-public-access';
import { getExampleForSchema } from '../../mocks/example-registry';

type NonEmptyArray<T> = readonly [T, ...T[]];

type RouteOptions = Parameters<typeof createRoute>[0] & {
  operationId: string;
  guard: MiddlewareHandler<Env> | NonEmptyArray<MiddlewareHandler<Env>>;
  middleware?: MiddlewareHandler<Env> | NonEmptyArray<MiddlewareHandler<Env>>;
};

type Route<P extends string, R extends Omit<RouteOptions, 'path'> & { path: P }> = ReturnType<
  typeof createRoute<P, Omit<R, 'guard'>>
>;

/**
 * Attempts to inject an example into a JSON response based on schema name.
 * Returns the original response if no example can be injected.
 */
const tryInjectExample = <T>(response: T): T => {
  // Use type guard to safely access nested properties
  const resp = response as { content?: { 'application/json'?: { schema?: unknown; example?: unknown } } };
  const jsonContent = resp.content?.['application/json'];

  // Skip if no schema or already has an example
  if (!jsonContent?.schema || jsonContent.example !== undefined) return response;

  // Look up example by schema name (cast required as getRefId expects ZodType)
  const schemaName = getRefId(jsonContent.schema as ZodType);
  if (!schemaName) return response;

  const example = getExampleForSchema(schemaName);
  if (!example) return response;

  // Return response with injected example, preserving original type
  return {
    ...response,
    content: {
      ...resp.content,
      'application/json': { ...jsonContent, example },
    },
  } as T;
};

/**
 * Injects examples into response content by looking up schema names in the example registry.
 * Only applies to 2xx success responses with application/json content.
 */
const injectResponseExamples = (responses: RouteOptions['responses']): RouteOptions['responses'] => {
  if (!responses) return responses;

  const result: RouteOptions['responses'] = {};
  for (const [statusCode, response] of Object.entries(responses)) {
    const status = Number.parseInt(statusCode, 10);
    const isSuccessStatus = !Number.isNaN(status) && status >= 200 && status < 300;
    result[statusCode] = isSuccessStatus ? tryInjectExample(response) : response;
  }
  return result;
};

/**
 * Custom wrapper around hono/zod-openapi createRoute to extend it with setting guard and other middleware.
 * The goal is to make setting a guard middleware explicit and required.
 * Also auto-injects response examples from the example registry based on schema names.
 *
 * @param routeConfig
 * @link https://github.com/honojs/middleware/tree/main/packages/zod-openapi#configure-middleware-for-each-endpoint
 */
export const createCustomRoute = <P extends string, R extends Omit<RouteOptions, 'path'> & { path: P }>({
  guard,
  ...routeConfig
}: R): Route<P, R> => {
  const initGuard = Array.isArray(guard) ? guard : [guard];
  const initMiddleware = routeConfig.middleware
    ? Array.isArray(routeConfig.middleware)
      ? routeConfig.middleware
      : [routeConfig.middleware]
    : [];
  const middleware = [...initGuard, ...initMiddleware];

  // Get specification extensions (x-*) from middleware
  const specificationExtensions = getSpecificationExtensions(middleware);

  // Public routes have no security, authenticated routes require cookie auth
  const security = initGuard.includes(isPublicAccess) ? [] : [{ cookieAuth: [] }];

  // Inject examples into responses based on schema names
  const responsesWithExamples = injectResponseExamples(routeConfig.responses);

  return createRoute({
    security,
    ...routeConfig, // allow routeConfig to override security
    responses: responsesWithExamples,
    middleware,
    ...specificationExtensions,
  });
};
