import type { createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import { errorResponseSchema } from './common-schemas';

type Responses = Parameters<typeof createRoute>[0]['responses'];

export const successResponseWithoutDataSchema = z.object({
  success: z.boolean(),
});

export const successResponseWithDataSchema = <T extends z.ZodTypeAny>(schema: T) => z.object({ success: z.boolean(), data: schema });

export const successResponseWithPaginationSchema = <T extends z.ZodTypeAny>(schema: T) =>
  z.object({
    success: z.boolean(),
    data: z.object({
      items: schema.array().openapi({
        description: 'The items',
      }),
      total: z.number().openapi({
        description: 'The total number of items',
        example: 1,
      }),
    }),
  });

export const errorResponses = {
  400: {
    description: 'Bad request: problem processing request.',
    content: {
      'application/json': {
        schema: errorResponseSchema,
      },
    },
  },
  401: {
    description: 'Unauthorized: authentication required.',
    content: {
      'application/json': {
        schema: errorResponseSchema,
      },
    },
  },
  403: {
    description: 'Forbidden: insufficient permissions.',
    content: {
      'application/json': {
        schema: errorResponseSchema,
      },
    },
  },
  404: {
    description: 'Not found: resource does not exist.',
    content: {
      'application/json': {
        schema: errorResponseSchema,
      },
    },
  },
  500: {
    description: 'Server error: something went wrong.',
    content: {
      'application/json': {
        schema: errorResponseSchema,
      },
    },
  },
} satisfies Responses;
