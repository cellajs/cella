import { z } from '@hono/zod-openapi';
import { severityLevels } from 'shared';
import { schemaTags } from '#/core/openapi-helpers';
import { mockApiError } from '#/schemas/api-error-mocks';
import { entityTypeSchema } from '#/schemas/common-schemas';

/** OpenAPI represents this as a number with min and max. */
const errorStatusCodeSchema = z.number().int().min(400).max(599);

/** The value of an extension member: each dynamic value of `detail`, and any other fact a client can act on. */
export const errorMemberValueSchema = z.union([z.number(), z.string(), z.array(z.string()), z.boolean(), z.null()]);

export const apiErrorSchema = z
  .object({
    type: z.string().openapi({
      description: "The stable code to branch on, a key of the API's error texts such as `invalid_request`: a relative URI reference.",
    }),
    title: z.string().openapi({ description: 'What the type means, the same for every occurrence: it holds no request data and is safe to log.' }),
    status: errorStatusCodeSchema,
    detail: z.string().openapi({ description: 'What went wrong in this request; it can quote values the request holds, so it is not logged.' }),
    instance: z.string().optional().openapi({
      description: 'The request id, also the `X-Request-Id` response header and in the server logs; quote it when reporting a failure.',
    }),
    severity: z.enum(severityLevels),
    entityType: entityTypeSchema.optional(),
    /** Release (git SHA) of the server that answered; during a rollout it can differ from the page's own. */
    version: z.string().optional(),
    path: z.string().optional(),
    method: z.string().optional(),
    timestamp: z.string().optional(),
  })
  .catchall(errorMemberValueSchema)
  .openapi('ApiError', {
    description:
      'The body of every error response, as RFC 9457 Problem Details (`application/problem+json`). `type` is the code to branch on, `title` its meaning and `detail` this occurrence. Every other member is an extension member: each value `detail` names is also a member of its own, kept for the type once added, such as `retryAfter` on a rate limit.',
    example: mockApiError(),
    'x-tags': schemaTags('errors', 'cella'),
  });

/** The members every error body sets itself; an `AppError`'s `meta` names none of them. */
export type ProblemMember = keyof typeof apiErrorSchema.shape;
