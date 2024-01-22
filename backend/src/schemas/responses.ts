import { createRoute } from '@hono/zod-openapi';
import { errorResponseSchema } from './common';

type Responses = Parameters<typeof createRoute>[0]['responses'];

export const errorResponses = {
  400: {
    description:
      'Bad Request - a problem reading or understanding the request.',
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
    description:
      "Forbidden - insuffucient permissions to proccess the request.",
    content: {
      'application/json': {
        schema: errorResponseSchema,
      },
    },
  },
  404: {
    description:
      'Not Found - the requested resource does not exist.',
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
