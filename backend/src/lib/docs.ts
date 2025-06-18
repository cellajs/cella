import type { Env } from '#/lib/context';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { Scalar } from '@scalar/hono-api-reference';
import { config } from 'config';
import { apiModulesList } from './docs-config';

/**
 * Generate OpenAPI documentation using hono/zod-openapi and scalar/hono-api-reference
 *
 * @link https://github.com/scalar/scalar/blob/main/documentation/configuration.md
 */
const docs = (app: OpenAPIHono<Env>) => {
  const registry = app.openAPIRegistry;
  const tags = apiModulesList;

  registry.registerComponent('securitySchemes', 'cookieAuth', {
    type: 'apiKey',
    in: 'cookie',
    name: `${config.slug}-session-${config.apiVersion}`,
    description:
      "Authentication cookie. Copy the cookie from your network tab and paste it here. If you don't have it, you need to sign in or sign up first.",
  });

  registry.registerComponent('schemas', 'BaseEntitySchema', {
    type: 'object',
    required: ['id', 'slug', 'name', 'email', 'entityType'],
    properties: {
      id: { type: 'string' },
      slug: { type: 'string' },
      name: { type: 'string' },
      thumbnailUrl: {
        type: ['string', 'null'],
      },
      bannerUrl: {
        type: ['string', 'null'],
      },
      entityType: {
        type: 'string',
        enum: [...config.contextEntityTypes],
      },
    },
  });

  // TODO add uniqe schema that we use on BE 
  // Review all existing schemas
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
    Scalar({
      url: 'openapi.json',
      defaultHttpClient: {
        targetKey: 'node',
        clientKey: 'axios',
      },
    }),
  );
};

export default docs;
