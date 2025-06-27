import type { Env } from '#/lib/context';
import { apiModulesList, registerAppSchema } from '#/lib/docs-config';
import { entityBaseSchema, userSummarySchema } from '#/modules/entities/schema';
import { menuSchema } from '#/modules/me/schema';
import { membershipSummarySchema } from '#/modules/memberships/schema';
import { errorSchema } from '#/utils/schema/responses';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { Scalar } from '@scalar/hono-api-reference';
import { config } from 'config';
import fs from 'node:fs/promises';

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
    name: `${config.slug}-session-${config.apiVersion}`,
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
    servers: [{ url: config.backendUrl }],
    info: {
      title: `${config.name} API`,
      version: config.apiVersion,
      description: config.apiDescription,
    },
    openapi: '3.1.0',
    tags,
    security: [{ cookieAuth: [] }],
  };

  // Review all existing schemas
  app.doc31('/openapi.json', openApiConfig);

  // Get JSON doc and save to file
  const openApiDoc = app.getOpenAPIDocument(openApiConfig);
  fs.writeFile('./openapi.json', JSON.stringify(openApiDoc, null, 2));

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
