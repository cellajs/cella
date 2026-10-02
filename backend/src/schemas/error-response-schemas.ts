import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import type { createRoute } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { schemaTags } from '#/core/openapi-helpers';
import { apiErrorSchema } from './api-error-schemas';

type Responses = Parameters<typeof createRoute>[0]['responses'];

type ZodBackedResponse = {
  description: string;
  content: { 'application/json': { schema: z.ZodTypeAny } };
};

type ErrorOption = (typeof errorResponseOptions)[number];
type Ref = ErrorOption['ref'];

/** HTTP error status codes registered in the OpenAPI spec. */
export type ErrorCode = ErrorOption['code'];

/** Feeds the Zod-backed responses, the `$ref` objects, and the OpenAPI registry components below. */
const errorResponseOptions = [
  {
    code: 400,
    name: 'BadRequestError',
    description: 'Bad request: problem processing request.',
    schemaDescription: 'The request is malformed or fails validation (400). `type` names the problem, such as `invalid_request`.',
    ref: '#/components/responses/BadRequestError',
  },
  {
    code: 401,
    name: 'UnauthorizedError',
    description: 'Unauthorized: authentication required.',
    schemaDescription:
      'The request carries no valid session, API key or access token, or it expired (401). Sign in again, or send a valid key or token.',
    ref: '#/components/responses/UnauthorizedError',
  },
  {
    code: 403,
    name: 'ForbiddenError',
    description: 'Forbidden: insufficient permissions.',
    schemaDescription:
      'The caller is known but may not do this (403): their role denies the action, a recent step-up is required, or the action is refused while impersonating. `type` names the reason, such as `step_up_required`.',
    ref: '#/components/responses/ForbiddenError',
  },
  {
    code: 404,
    name: 'NotFoundError',
    description: 'Not found: resource does not exist.',
    schemaDescription:
      'The resource does not exist, or the caller may not read it (404). Both get the same answer, so a response never confirms that an id exists.',
    ref: '#/components/responses/NotFoundError',
  },
  {
    code: 409,
    name: 'ConflictError',
    description: 'Conflict: resource state conflict.',
    schemaDescription:
      'The request conflicts with the current state (409), such as a link that belongs to another account (`user_mismatch`) or a create already in progress. Reload the current state before retrying.',
    ref: '#/components/responses/ConflictError',
  },
  {
    code: 429,
    name: 'TooManyRequestsError',
    description: 'Rate limit: too many requests.',
    schemaDescription:
      "A rate limit refused the request (429). The `Retry-After` header says when to try again; an operation's rate limiters show what is counted.",
    ref: '#/components/responses/TooManyRequestsError',
  },
] as const;

const errorBodySchema = (code: ErrorCode) => {
  const option = errorResponseOptions.find((o) => o.code === code);
  return apiErrorSchema
    .extend({ status: z.literal(code) })
    .openapi(option?.name ?? 'Error', { description: option?.schemaDescription, 'x-tags': schemaTags('errors', 'cella') });
};

// Numeric-keyed map for registry work; no `ref` here.
const zodErrorResponses: Partial<Record<ErrorCode, ZodBackedResponse>> = Object.fromEntries(
  errorResponseOptions.map(({ code, description }) => [
    code,
    {
      description,
      content: { 'application/json': { schema: errorBodySchema(code) } },
    } satisfies ZodBackedResponse,
  ]),
);

/** String-indexed, for registry work. No `ref` here. */
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
 * `$ref` responses for route definitions, so the OpenAPI output does not inline the full schema per route.
 * The cast makes them look like inline Zod-backed responses: without it `@hono/zod-openapi` sees objects with
 * no `content` key and widens the handler return type to `Response`, dropping response type checking.
 */
export const errorResponseRefs = errorResponseOptions.reduce(
  (acc, { code, ref }) => {
    acc[code] = { $ref: ref };
    return acc;
  },
  {} as Record<ErrorCode, { $ref: Ref }>,
) as unknown as Record<ErrorCode, ZodBackedResponse>;

// Registry helpers
const registerResponseFromZod = (registry: OpenAPIRegistry, responseName: string, schemaName: string, response: ZodBackedResponse) => {
  const schema = response.content['application/json'].schema;
  registry.register(schemaName, schema);
  registry.registerComponent('responses', responseName, {
    description: response.description,
    content: { 'application/json': { schema: { $ref: `#/components/schemas/${schemaName}` } } },
  });
};

export const registerAllErrorResponses = (
  registry: OpenAPIRegistry,
  responses: Partial<Record<ErrorCode, ZodBackedResponse>> = zodErrorResponses,
) => {
  for (const { code, name } of errorResponseOptions) {
    const r = responses[code];
    if (r) registerResponseFromZod(registry, name, name, r);
  }
};
