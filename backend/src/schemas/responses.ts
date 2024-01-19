import { createRoute } from '@hono/zod-openapi';
import { errorResponseSchema } from './common';

type Responses = Parameters<typeof createRoute>[0]['responses'];

export const errorResponses = {
  400: {
    description:
      'The server cannot or will not process the request due to something that is perceived to be a client error (e.g., malformed request syntax, invalid request message framing, or deceptive request routing).',
    content: {
      'application/json': {
        schema: errorResponseSchema,
      },
    },
  },
  401: {
    description: 'Unauthorized (go to /sign-in or /sign-up)',
    content: {
      'application/json': {
        schema: errorResponseSchema,
      },
    },
  },
  403: {
    description:
      "The client does not have access rights to the content; that is, it is unauthorized, so the server is refusing to give the requested resource. Unlike 401 Unauthorized, the client's identity is known to the server.",
    content: {
      'application/json': {
        schema: errorResponseSchema,
      },
    },
  },
  404: {
    description:
      'The server cannot find the requested resource. In the browser, this means the URL is not recognized. In an API, this can also mean that the endpoint is valid but the resource itself does not exist. Servers may also send this response instead of 403 Forbidden to hide the existence of a resource from an unauthorized client. This response code is probably the most well known due to its frequent occurrence on the web.',
    content: {
      'application/json': {
        schema: errorResponseSchema,
      },
    },
  },
  500: {
    description: 'The server has encountered a situation it does not know how to handle.',
    content: {
      'application/json': {
        schema: errorResponseSchema,
      },
    },
  },
} satisfies Responses;
