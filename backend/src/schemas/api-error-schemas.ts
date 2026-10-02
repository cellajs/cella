import { z } from '@hono/zod-openapi';
import type { Severity } from 'shared';
import { schemaTags } from '#/core/openapi-helpers';
import { mockApiError } from './api-error-mocks';
import { entityTypeSchema } from './common-schemas';

export const severityLevels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const satisfies readonly Severity[];

/** OpenAPI represents this as a number with min and max. */
const errorStatusCodeSchema = z
  .number()
  .int()
  .min(400)
  .max(599)
  .refine((val) => val >= 400 && val < 600, { message: 'Must be a valid error status code (400-599)' });

export const apiErrorSchema = z
  .object({
    name: z.string(),
    message: z.string(),
    /** Error key from `locales/en/error.json`, e.g. 'invalid_request'. */
    type: z.string(),
    status: errorStatusCodeSchema,
    severity: z.enum(severityLevels),
    entityType: entityTypeSchema.optional(),
    /** Request id, also sent as the `X-Request-Id` response header and logged with the request; quote it when reporting a failure. */
    requestId: z.string().optional(),
    path: z.string().optional(),
    method: z.string().optional(),
    timestamp: z.string().optional(),
    userId: z.string().optional(),
    organizationId: z.string().optional(),
    /** Optional structured metadata (e.g. retryAfter, slug, reason). */
    meta: z.record(z.string(), z.union([z.number(), z.string(), z.array(z.string()), z.boolean(), z.null()])).optional(),
  })
  .openapi('ApiError', {
    description:
      'The body of every error response. `type` is a stable code to branch on, `message` is readable text, and `requestId` identifies the request in the server logs.',
    example: mockApiError(),
    'x-tags': schemaTags('errors', 'cella'),
  });
