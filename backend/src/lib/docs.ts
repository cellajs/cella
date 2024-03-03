import { swaggerUI } from '@hono/swagger-ui';
import { config } from 'config';
import { CustomHono } from '../types/common';

const openAPITags = [
  { name: 'auth', description: 'Authentication' },
  { name: 'users', description: 'Users' },
  { name: 'organizations', description: 'Organizations' },
  { name: 'general', description: 'General' },
  { name: 'public', description: 'Public' },
];

const docs = (app: CustomHono) => {
  const registry = app.openAPIRegistry;

  registry.registerComponent('securitySchemes', 'cookieAuth', {
    type: 'apiKey',
    in: 'cookie',
    name: `${config.slug}-session-v1`,
    description: "Authentication cookie. If you don't have it, you need to sign in or sign up first.",
  });

  app.doc31('/openapi.json', {
    info: {
      title: `${config.name} API`,
      version: 'v1',
      description: 'This is a showcase API documentation built using hono middleware: zod-openapi.',
    },
    openapi: '3.1.0',
    tags: openAPITags,
    security: [{ cookieAuth: [] }],
  });

  app.get(
    '/docs',
    swaggerUI({
      url: 'openapi.json',
    }),
  );
};

export default docs;
