import type { OpenAPIHono } from '@hono/zod-openapi';
import { apiReference } from '@scalar/hono-api-reference';
import { config } from 'config';
import type { Env } from '#/lib/context';
import { appModulesList } from '#/routes';

const commonModulesList = [
  { name: 'me', description: 'Current user endpoints. Split from `users` due to different authorization flow.' },
  { name: 'users', description: '`user` is also an entity, but NOT a contextual entity.' },
  {
    name: 'memberships',
    description:
      'Memberships represent one-to-one relations between a `user` and a contextual `entity`, such as an `organization`. It contains a role and archived, muted status. It also contains parent entities.',
  },
  { name: 'organizations', description: 'Organizations - `organization` - are a core `entity`.' },
  { name: 'requests', description: 'Receive contact form, newsletter and waitlist requests.' },
  { name: 'general', description: 'Endpoints that are system-wide, system related or span multiple entities.' },
  {
    name: 'auth',
    description: 'Multiple authentication methods are included: email/password combination, OAuth and passkey support.',
  },
  { name: 'attachments', description: 'Be able to leverage different attachment types within an entity.' },
  { name: 'metrics', description: 'Observability endpoints.' },
];

/**
 * Generate OpenAPI documentation using hono/zod-openapi and scalar/hono-api-reference
 *
 * @link https://github.com/scalar/scalar/blob/main/documentation/configuration.md
 */
const docs = (app: OpenAPIHono<Env>) => {
  const registry = app.openAPIRegistry;
  const tags = commonModulesList.concat(appModulesList);

  registry.registerComponent('securitySchemes', 'cookieAuth', {
    type: 'apiKey',
    in: 'cookie',
    name: `${config.slug}-session-${config.apiVersion}`,
    description:
      "Authentication cookie. Copy the cookie from your network tab and paste it here. If you don't have it, you need to sign in or sign up first.",
  });

  app.doc31('/openapi.json', {
    servers: [{ url: config.backendUrl }],
    info: {
      title: `${config.name} API`,
      version: config.apiVersion,
      description: config.apiDescription,
    },
    openapi: '3.1.0',
    tags,
    security: [{ cookieAuth: [] }],
  });

  app.get(
    '/docs',
    apiReference({
      defaultHttpClient: {
        targetKey: 'node',
        clientKey: 'axios',
      },
      spec: {
        url: 'openapi.json',
      },
    }),
  );
};

export default docs;
