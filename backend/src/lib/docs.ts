import fs from 'node:fs/promises';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { Scalar } from '@scalar/hono-api-reference';
import { appConfig } from 'config';
import type { Env } from '#/lib/context';
import { apiModulesList, registerAppSchema } from '#/lib/docs-config';
import { entityBaseSchema, userSummarySchema } from '#/modules/entities/schema';
import { menuSchema } from '#/modules/me/schema';
import { membershipSummarySchema } from '#/modules/memberships/schema';
import { errorSchema } from '#/utils/schema/error';

/**
 * Generate OpenAPI documentation using hono/zod-openapi and scalar/hono-api-reference
 *
 * @link https://github.com/scalar/scalar/blob/main/documentation/configuration.md
 */
const docs = async (app: OpenAPIHono<Env>) => {
  const registry = app.openAPIRegistry;
  const tags = apiModulesList;

  // Set security schemes
  registry.registerComponent('securitySchemes', 'cookieAuth', {
    type: 'apiKey',
    in: 'cookie',
    name: `${appConfig.slug}-session-${appConfig.apiVersion}`,
    description:
      "Authentication cookie. Copy the cookie from your network tab and paste it here. If you don't have it, you need to sign in or sign up first.",
  });

  // Register lower-level schemas
  registry.register('EntityBaseSchema', entityBaseSchema);
  registry.register('UserSummarySchema', userSummarySchema);
  registry.register('MembershipSummarySchema', membershipSummarySchema);
  registry.register('MenuSchema', menuSchema);
  registry.register('ApiError', errorSchema);

  registerAppSchema(registry);

  const openApiConfig = {
    servers: [{ url: appConfig.backendUrl }],
    info: {
      title: `${appConfig.name} API`,
      version: appConfig.apiVersion,
      description: appConfig.apiDescription,
    },
    openapi: '3.1.0',
    tags,
    security: [{ cookieAuth: [] }],
  };

  // Review all existing schemas
  app.doc31('/openapi.json', openApiConfig);

  // Get JSON doc and save to file
  const openApiDoc = app.getOpenAPI31Document(openApiConfig);
  fs.writeFile('./openapi.cache.json', JSON.stringify(openApiDoc, null, 2));

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
