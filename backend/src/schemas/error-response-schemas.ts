import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from '@hono/zod-openapi';
import { schemaTags } from '#/core/openapi-helpers';
import { apiErrorSchema } from './api-error-schemas';

type ZodBackedResponse = {
  description: string;
  content: { 'application/json': { schema: z.ZodTypeAny } };
};

type ErrorOption = (typeof errorResponseOptions)[number];
type Ref = `#/components/responses/${ErrorOption['name']}`;

/** HTTP error status codes registered in the OpenAPI spec. */
export type ErrorCode = ErrorOption['code'];

/** Feeds the `$ref` objects and the OpenAPI registry components below. */
const errorResponseOptions = [
  {
    code: 400,
    name: 'BadRequestError',
    description: 'Bad request: problem processing request.',
    schemaDescription: 'The request is malformed or fails validation (400). `type` names the problem, such as `invalid_request`.',
  },
  {
    code: 401,
    name: 'UnauthorizedError',
    description: 'Unauthorized: authentication required.',
    schemaDescription:
      'The request carries no valid session, API key or access token, or it expired (401). Sign in again, or send a valid key or token.',
  },
  {
    code: 403,
    name: 'ForbiddenError',
    description: 'Forbidden: insufficient permissions.',
    schemaDescription:
      'The caller is known but may not do this (403): their role denies the action, a recent step-up is required, or the action is refused while impersonating. `type` names the reason, such as `step_up_required`.',
  },
  {
    code: 404,
    name: 'NotFoundError',
    description: 'Not found: resource does not exist.',
    schemaDescription:
      'The resource does not exist, or the caller may not read it (404). Both get the same answer, so a response never confirms that an id exists.',
  },
  {
    code: 409,
    name: 'ConflictError',
    description: 'Conflict: resource state conflict.',
    schemaDescription:
      'The request conflicts with the current state (409), such as a link that belongs to another account (`user_mismatch`) or a create already in progress. Reload the current state before retrying.',
  },
  {
    code: 429,
    name: 'TooManyRequestsError',
    description: 'Rate limit: too many requests.',
    schemaDescription:
      "A rate limit refused the request (429). The `Retry-After` header says when to try again; an operation's rate limiters show what is counted.",
  },
] as const;

const errorBodySchema = ({ code, name, schemaDescription }: ErrorOption) =>
  apiErrorSchema.extend({ status: z.literal(code) }).openapi(name, { description: schemaDescription, 'x-tags': schemaTags('errors', 'cella') });

/**
 * `$ref` responses for route definitions, so the OpenAPI output does not inline the full schema per route.
 * The cast makes them look like inline Zod-backed responses: without it `@hono/zod-openapi` sees objects with
 * no `content` key and widens the handler return type to `Response`, dropping response type checking.
 */
export const errorResponseRefs = errorResponseOptions.reduce(
  (acc, { code, name }) => {
    acc[code] = { $ref: `#/components/responses/${name}` };
    return acc;
  },
  {} as Record<ErrorCode, { $ref: Ref }>,
) as unknown as Record<ErrorCode, ZodBackedResponse>;

/** Registers each error body under `components/schemas` and its response under `components/responses`, where `errorResponseRefs` point. */
export const registerAllErrorResponses = (registry: OpenAPIRegistry) => {
  for (const option of errorResponseOptions) {
    registry.register(option.name, errorBodySchema(option));
    registry.registerComponent('responses', option.name, {
      description: option.description,
      content: { 'application/json': { schema: { $ref: `#/components/schemas/${option.name}` } } },
    });
  }
};
