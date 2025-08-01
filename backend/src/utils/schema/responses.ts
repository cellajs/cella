import type { createRoute } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { errorSchema } from '#/utils/schema/error';

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
 * Schema for a successful response with disallowed IDs.
 */
export const successWithRejectedItemsSchema = z.object({
  success: z.boolean(),
  rejectedItems: z.array(z.string()),
});

/**
 * Set of common error responses with descriptions and schemas.  Includes: 400, 401, 403, 404, 429.
 */
export const errorResponses = {
  400: {
    description: 'Bad request: problem processing request.',
    content: {
      'application/json': {
        schema: errorSchema.extend({ status: z.literal(400) }),
      },
    },
  },
  401: {
    description: 'Unauthorized: authentication required.',
    content: {
      'application/json': {
        schema: errorSchema.extend({ status: z.literal(401) }),
      },
    },
  },
  403: {
    description: 'Forbidden: insufficient permissions.',
    content: {
      'application/json': {
        schema: errorSchema.extend({ status: z.literal(403) }),
      },
    },
  },
  404: {
    description: 'Not found: resource does not exist.',
    content: {
      'application/json': {
        schema: errorSchema.extend({ status: z.literal(404) }),
      },
    },
  },
  429: {
    description: 'Rate limit: too many requests.',
    content: {
      'application/json': {
        schema: errorSchema.extend({ status: z.literal(429) }),
      },
    },
  },
} satisfies Responses;
