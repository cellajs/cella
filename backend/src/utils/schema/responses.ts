import type { createRoute } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { config } from 'config';
import { entityTypeSchema } from '#/utils/schema/common';

/**
 * Type alias for the responses parameter of createRoute.
 */
type Responses = Parameters<typeof createRoute>[0]['responses'];

/**
 * Schema for a response without data.
 */
export const successWithoutDataSchema = z.boolean();

/**
 * Schema for a response with paginated data
 *
 * @param schema - The schema for the items in the paginated data. Data object has `items` and `total` properties.
 */
export const paginationSchema = <T extends z.ZodTypeAny>(schema: T) => z.object({ items: schema.array(), total: z.number() });

/**
 * Schema for errors in a response.
 */
export const errorSchema = z
  .object({
    name: z.string(), // Error name
    message: z.string(), // Error message
    type: z.string(), // Error type identifier
    status: z.number(), // HTTP status code
    severity: z.enum(config.severityLevels), // Severity level
    entityType: entityTypeSchema.optional(), // Optional related entity type
    logId: z.string().optional(), // Optional log identifier
    path: z.string().optional(), // Optional request path
    method: z.string().optional(), // Optional HTTP method
    timestamp: z.string().optional(), // Optional timestamp
    userId: z.string().optional(), // Optional user identifier
    organizationId: z.string().optional(), // Optional organization identifier
  })
  .openapi('ApiError');

/**
 * Schema for a successful response with disallowed IDs.
 */
export const successWithRejectedIdsSchema = () =>
  z.object({
    success: z.boolean(),
    rejectedIds: z.array(z.string()),
  });

/**
 * Set of common error responses with descriptions and schemas.  Includes: 400, 401, 403, 404, 429.
 */
export const errorResponses = {
  400: {
    description: 'Bad request: problem processing request.',
    content: {
      'application/json': {
        schema: errorSchema,
      },
    },
  },
  401: {
    description: 'Unauthorized: authentication required.',
    content: {
      'application/json': {
        schema: errorSchema,
      },
    },
  },
  403: {
    description: 'Forbidden: insufficient permissions.',
    content: {
      'application/json': {
        schema: errorSchema,
      },
    },
  },
  404: {
    description: 'Not found: resource does not exist.',
    content: {
      'application/json': {
        schema: errorSchema,
      },
    },
  },
  429: {
    description: 'Rate limit: too many requests.',
    content: {
      'application/json': {
        schema: errorSchema,
      },
    },
  },
} satisfies Responses;
