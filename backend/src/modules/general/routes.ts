import { createRoute, z } from '@hono/zod-openapi';
import { errorResponses, successResponseWithDataSchema, successResponseWithoutDataSchema } from '../../schemas/responses';
import { acceptInviteJsonSchema, inviteJsonSchema } from './schema';

export const getPublicCountsRoute = createRoute({
  method: 'get',
  path: '/public/counts',
  tags: ['general'],
  summary: 'Get public counts',
  responses: {
    200: {
      description: 'Public counts',
      content: {
        'application/json': {
          schema: successResponseWithDataSchema(
            z.object({
              organizations: z.number().openapi({
                description: 'The number of organizations',
              }),
              users: z.number().openapi({
                description: 'The number of users',
              }),
            }),
          ),
        },
      },
    },
    ...errorResponses,
  },
});

export const getUploadTokenRoute = createRoute({
  method: 'get',
  path: '/upload-token',
  tags: ['general'],
  summary: 'Get upload token for user or organization',
  request: {
    query: z.object({
      public: z.string().optional().default('false'),
      organization: z.string().optional(),
      width: z.string().optional(),
      height: z.string().optional(),
      quality: z.string().optional(),
      format: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: 'Upload token with a scope for a user or organization',
      content: {
        'application/json': {
          schema: successResponseWithDataSchema(
            z.string().openapi({
              description: 'The upload token (JWT)',
            }),
          ),
        },
      },
    },
    ...errorResponses,
  },
});

export const checkSlugRoute = createRoute({
  method: 'get',
  path: '/check-slug/{slug}',
  tags: ['general'],
  summary: 'Check if a slug is already in use',
  request: {
    params: z.object({
      slug: z.string(),
    }),
  },
  responses: {
    200: {
      description: 'User',
      content: {
        'application/json': {
          schema: successResponseWithDataSchema(z.boolean()),
        },
      },
    },
    ...errorResponses,
  },
});

export const inviteRoute = createRoute({
  method: 'post',
  path: '/invite',
  tags: ['general'],
  summary: 'Invite a new member(user) to organization or system',
  description: `
    Permissions:
      - Users with role 'ADMIN'
      - Users, who are members of the organization and have role 'ADMIN' in the organization
  `,
  request: {
    body: {
      content: {
        'application/json': {
          schema: inviteJsonSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Invitation was sent',
      content: {
        'application/json': {
          schema: successResponseWithoutDataSchema,
        },
      },
    },
    ...errorResponses,
  },
});

export const acceptInviteRoute = createRoute({
  method: 'post',
  path: '/accept-invite/{token}',
  tags: ['general'],
  summary: 'Accept invitation',
  request: {
    params: z.object({
      token: z.string(),
    }),
    body: {
      content: {
        'application/json': {
          schema: acceptInviteJsonSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Invitation was accepted',
      content: {
        'application/json': {
          schema: successResponseWithDataSchema(z.string()),
        },
      },
    },
    302: {
      description: 'Redirect to github',
      headers: z.object({
        Location: z.string(),
      }),
    },
    ...errorResponses,
  },
});

export const checkInviteRoute = createRoute({
  method: 'get',
  path: '/check-invite/{token}',
  tags: ['general'],
  summary: 'Check invite by invite token',
  request: {
    params: z.object({
      token: z.string(),
    }),
  },
  responses: {
    200: {
      description: 'Emails of invited users',
      content: {
        'application/json': {
          schema: successResponseWithoutDataSchema,
        },
      },
    },
    ...errorResponses,
  },
});
