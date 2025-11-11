import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import type { createRoute } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { apiErrorSchema } from '#/utils/schema/api-error';

type Responses = Parameters<typeof createRoute>[0]['responses'];

type ZodBackedResponse = {
  description: string;
  content: { 'application/json': { schema: z.ZodTypeAny } };
};

type ErrorOption = (typeof errorResponseOptions)[number];
type ErrorCode = ErrorOption['code'];
type Ref = ErrorOption['ref'];

/**
 * Standardized error response specifications, used to generate:
 * - Zod-backed response objects for route definitions
 * - `$ref` objects for route definitions
 * - OpenAPI registry components
 */
const errorResponseOptions = [
  {
    code: 400,
    name: 'BadRequestError',
    description: 'Bad request: problem processing request.',
    ref: '#/components/responses/BadRequestError',
  },
  {
    code: 401,
    name: 'UnauthorizedError',
    description: 'Unauthorized: authentication required.',
    ref: '#/components/responses/UnauthorizedError',
  },
  {
    code: 403,
    name: 'ForbiddenError',
    description: 'Forbidden: insufficient permissions.',
    ref: '#/components/responses/ForbiddenError',
  },
  {
    code: 404,
    name: 'NotFoundError',
    description: 'Not found: resource does not exist.',
    ref: '#/components/responses/NotFoundError',
  },
  {
    code: 429,
    name: 'TooManyRequestsError',
    description: 'Rate limit: too many requests.',
    ref: '#/components/responses/TooManyRequestsError',
  },
] as const;

// Helper to create error body schemas
const errorBodySchema = (code: ErrorCode) => apiErrorSchema.extend({ status: z.literal(code) });

// Helper that creates a numeric map for registry work (we simply *don’t* include `ref` here)
const zodErrorResponses: Partial<Record<ErrorCode, ZodBackedResponse>> = Object.fromEntries(
  errorResponseOptions.map(({ code, description }) => [
    code,
    {
      description,
      content: { 'application/json': { schema: errorBodySchema(code) } },
    } satisfies ZodBackedResponse,
  ]),
);

/**
 * Error `responses` (string-indexed) for registry work. No `ref` here.
 */
export const errorResponses: Responses = Object.fromEntries(
  errorResponseOptions.map(({ code, description }) => [
    String(code),
    {
      description,
      content: { 'application/json': { schema: errorBodySchema(code) } },
    },
  ]),
);

/**
 * Errors as array of `$ref` for creating routes
 */
export const errorResponseRefs: Record<ErrorCode, { $ref: Ref }> = errorResponseOptions.reduce(
  (acc, { code, ref }) => {
    acc[code] = { $ref: ref };
    return acc;
  },
  {} as Record<ErrorCode, { $ref: Ref }>,
);

// Registry helpers
const registerResponseFromZod = (registry: OpenAPIRegistry, responseName: string, schemaName: string, response: ZodBackedResponse) => {
  const schema = response.content['application/json'].schema;
  registry.register(schemaName, schema);
  registry.registerComponent('responses', responseName, {
    description: response.description,
    content: { 'application/json': { schema: { $ref: `#/components/schemas/${schemaName}` } } },
  });
};

/**
 * Register all errors in registry
 */
export const registerAllErrorResponses = (
  registry: OpenAPIRegistry,
  responses: Partial<Record<ErrorCode, ZodBackedResponse>> = zodErrorResponses,
) => {
  for (const { code, name } of errorResponseOptions) {
    const r = responses[code];
    if (r) registerResponseFromZod(registry, name, name, r);
  }
};
