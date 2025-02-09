import type { createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import { errorSchema } from './common-schemas';

/**
 * Type alias for the responses parameter of createRoute.
 */
type Responses = Parameters<typeof createRoute>[0]['responses'];

/**
 * Schema for a successful response without data.
 */
export const successWithoutDataSchema = z.object({
  success: z.boolean(),
});

/**
 * Schema for a successful response with data.
 */
export const successWithDataSchema = <T extends z.ZodTypeAny>(schema: T) => z.object({ success: z.boolean(), data: schema });

/**
 * Schema for a successful response with paginated data
 *
 * @param schema - The schema for the items in the paginated data. Data object has `items` and `total` properties.
 */
export const successWithPaginationSchema = <T extends z.ZodTypeAny>(schema: T) =>
  z.object({
    success: z.boolean(),
    data: z.object({
      items: schema.array(),
      total: z.number(),
    }),
  });

/**
 * Schema for a successful response with errors.
 */
export const successWithErrorsSchema = () =>
  z.object({
    success: z.boolean(),
    errors: z.array(errorSchema),
  });

/**
 * Schema for a failed response with errors.
 */
export const failWithErrorSchema = z.object({
  success: z.boolean().default(false),
  error: errorSchema,
});

/**
 * Set of common error responses with descriptions and schemas.  Includes: 400, 401, 403, 404, 429.
 */
export const errorResponses = {
  400: {
    description: 'Bad request: problem processing request.',
    content: {
      'application/json': {
        schema: failWithErrorSchema,
      },
    },
  },
  401: {
    description: 'Unauthorized: authentication required.',
    content: {
      'application/json': {
        schema: failWithErrorSchema,
      },
    },
  },
  403: {
    description: 'Forbidden: insufficient permissions.',
    content: {
      'application/json': {
        schema: failWithErrorSchema,
      },
    },
  },
  404: {
    description: 'Not found: resource does not exist.',
    content: {
      'application/json': {
        schema: failWithErrorSchema,
      },
    },
  },
  429: {
    description: 'Rate limit: too many requests.',
    content: {
      'application/json': {
        schema: failWithErrorSchema,
      },
    },
  },
} satisfies Responses;
