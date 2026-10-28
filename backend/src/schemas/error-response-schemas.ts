import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from '@hono/zod-openapi';
import { schemaTags } from '#/core/openapi-helpers';
import { mockApiError } from '#/schemas/api-error-mocks';
import { apiErrorSchema } from '#/schemas/api-error-schemas';

/** A header an error response component documents. */
type HeaderDoc = { description: string; schema: { type: 'string' } | { type: 'integer'; minimum: number } };

const requestIdHeader = {
  'X-Request-Id': { description: 'The request id, also `requestId` in the body; quote it when reporting a failure.', schema: { type: 'string' } },
} satisfies Record<string, HeaderDoc>;

const retryAfterHeader = {
  'Retry-After': { description: 'Seconds to wait before trying again, at least 1.', schema: { type: 'integer', minimum: 1 } },
} satisfies Record<string, HeaderDoc>;

/** One entry per documented error status: its response component, the description of its body schema, and its headers beyond `X-Request-Id`. */
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
      'The request conflicts with the current state (409), such as a link that belongs to another account (`user_mismatch`) or a create already in progress. Reload the current state before retrying. Any write can answer `write_conflict` when a concurrent transaction won: retry as is.',
  },
  {
    code: 413,
    name: 'PayloadTooLargeError',
    description: 'Payload too large: the request body exceeds its limit.',
    schemaDescription:
      'The request body is larger than the limit for its content type (413): a JSON body, a file upload and any other body each have their own.',
  },
  {
    code: 429,
    name: 'TooManyRequestsError',
    description: 'Rate limit: too many requests.',
    schemaDescription:
      "A rate limit refused the request (429). The `Retry-After` header says when to try again; an operation's rate limiters show what is counted.",
    headers: retryAfterHeader,
  },
] as const;

type ErrorOption = (typeof errorResponseOptions)[number];

/** The error statuses with a documented response; an `AppError` carries one of these, 410 or a server error. */
export type ErrorCode = ErrorOption['code'];

const errorBodySchema = ({ code, name, schemaDescription }: ErrorOption) =>
  apiErrorSchema
    .extend({ status: z.literal(code) })
    .openapi(name, { description: schemaDescription, example: mockApiError(code), 'x-tags': schemaTags('errors', 'cella') });

/** A Zod-backed response, as `json()` builds one, whose body is the error body of one status. */
type ErrorResponse = { description: string; content: { 'application/json': { schema: ReturnType<typeof errorBodySchema> } } };

/**
 * The shared response of each documented error status, built once so a route's `responses` and the registry hold the
 * same schema instance. A route carries it as a Zod-backed response, which keeps the handler's return type exact;
 * `foldErrorResponses` writes it in the document as a `$ref` to the component `registerAllErrorResponses` registers.
 */
export const sharedErrorResponses = Object.fromEntries(
  errorResponseOptions.map((option) => [
    option.code,
    { description: option.description, content: { 'application/json': { schema: errorBodySchema(option) } } },
  ]),
) as Record<ErrorCode, ErrorResponse>;

/** Each error response component by name, with the description a folded response must carry. */
export const errorResponseComponents: ReadonlyMap<string, string> = new Map(errorResponseOptions.map(({ name, description }) => [name, description]));

/** Registers each error body under `components/schemas` and its response, headers included, under `components/responses`. */
export const registerAllErrorResponses = (registry: OpenAPIRegistry) => {
  for (const option of errorResponseOptions) {
    registry.register(option.name, sharedErrorResponses[option.code].content['application/json'].schema);
    registry.registerComponent('responses', option.name, {
      description: option.description,
      headers: { ...requestIdHeader, ...('headers' in option ? option.headers : {}) },
      content: { 'application/json': { schema: { $ref: `#/components/schemas/${option.name}` } } },
    });
  }
};
