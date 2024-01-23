import { swaggerUI } from '@hono/swagger-ui';
import { CustomHono } from '../types/common';

const docs = (app: CustomHono) => {
  const registry = app.openAPIRegistry;

  registry.registerComponent('securitySchemes', 'cookieAuth', {
    type: 'apiKey',
    in: 'cookie',
    name: 'auth_session',
    description:
      "Authentication cookie. If you don't have it, you need to sign in or sign up first(/sign-in and /sign-up routes automatically set the cookie).",
  });

  app.doc31('/openapi.json', {
    info: {
      title: 'Cella API',
      version: 'v1',
      description: 'This is a showcase API documentation built using hono middleware: zod-openapi.',
    },
    openapi: '3.1.0',
    tags: [
      {
        name: 'auth',
        description: 'Authentication',
      },
      {
        name: 'users',
        description: 'Users',
      },
      {
        name: 'organizations',
        description: 'Organizations',
      },
      {
        name: 'uploads',
        description: 'Uploads',
      },
      {
        name: 'public',
        description: 'Public',
      },
    ],
    security: [
      {
        cookieAuth: [],
      },
    ],
  });

  app.get(
    '/docs',
    swaggerUI({
      url: 'openapi.json',
    }),
  );
};

export default docs;
