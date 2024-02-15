import type { createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import { errorResponseSchema } from './common';

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
    description: 'Bad Request - a problem reading or understanding the request.',
    content: {
      'application/json': {
        schema: errorResponseSchema,
      },
    },
  },
  401: {
    description: 'Unauthorized - authentication required.',
    content: {
      'application/json': {
        schema: errorResponseSchema,
      },
    },
  },
  403: {
    description: 'Forbidden - insuffucient permissions to proccess the request.',
    content: {
      'application/json': {
        schema: errorResponseSchema,
      },
    },
  },
  404: {
    description: 'Not Found - the requested resource does not exist.',
    content: {
      'application/json': {
        schema: errorResponseSchema,
      },
    },
  },
  500: {
    description: 'Internal Server Error - something went wrong.',
    content: {
      'application/json': {
        schema: errorResponseSchema,
      },
    },
  },
} satisfies Responses;
