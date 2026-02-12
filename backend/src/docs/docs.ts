import fs from 'node:fs/promises';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { Scalar } from '@scalar/hono-api-reference';
import { appConfig } from 'shared';
import { buildExtensionRegistry } from '#/docs/openapi-extensions';
import { openapiTags, registerAppSchema } from '#/docs/tags-config';
import { getExtensionValueDescriptions } from '#/docs/x-middleware';
import type { Env } from '#/lib/context';
import { membershipBaseSchema } from '#/modules/memberships/memberships-schema';
import { errorResponses, registerAllErrorResponses } from '#/schemas';
import { contextEntityBaseSchema } from '#/schemas/entity-base';
import { streamNotificationSchema } from '#/schemas/stream-schemas';
import { stxBaseSchema } from '#/schemas/sync-transaction-schemas';
import { userBaseSchema } from '#/schemas/user-schema-base';
import { checkMark } from '#/utils/console';

/**
 * Generate OpenAPI documentation using hono/zod-openapi and scalar/hono-api-reference
 *
 * @param app - The OpenAPIHono application instance
 * @param skipScalar - If true, skips the Scalar integration for API reference
 *
 * @link https://github.com/scalar/scalar/blob/main/documentation/configuration.md
 */
const docs = async (app: OpenAPIHono<Env>, skipScalar = false) => {
  const registry = app.openAPIRegistry;

  // Build extension registry with collected value descriptions
  const extensionRegistry = buildExtensionRegistry(getExtensionValueDescriptions());

  // OpenAPI configuration
  const openApiConfig = {
    servers: [{ url: appConfig.backendUrl }],
    info: {
      title: `${appConfig.name} API`,
      version: appConfig.apiVersion,
      description: appConfig.apiDescription,
      'x-extensions': extensionRegistry,
    },
    openapi: '3.1.0',
    tags: openapiTags,
  };

  // Set security schemes
  registry.registerComponent('securitySchemes', 'cookieAuth', {
    type: 'apiKey',
    in: 'cookie',
    name: `${appConfig.slug}-session-${appConfig.apiVersion}`,
    description:
      "Authentication cookie. Copy cookie from your network tab and paste it here. If you don't have it, you need to sign in or sign up first.",
  });

  // Register base schemas (not auto-registered as they're only used for extending other schemas)
  registry.register('UserBase', userBaseSchema);
  registry.register('ContextEntityBase', contextEntityBaseSchema);
  registry.register('MembershipBase', membershipBaseSchema);
  registry.register('StxBase', stxBaseSchema);

  // Register stream notification schema (SSE payloads, not in REST responses but useful for client typing)
  registry.register('StreamNotification', streamNotificationSchema);

  // Register error responses
  registerAllErrorResponses(registry, errorResponses);

  // Register application-specific schemas
  registerAppSchema(registry);

  // Review all existing schemas
  app.doc31('/openapi.json', openApiConfig);

  // Get JSON doc and save to file
  const openApiDoc = app.getOpenAPI31Document(openApiConfig);

  await fs.writeFile('./openapi.cache.json', JSON.stringify(openApiDoc, null, 2));
  console.info(`${checkMark} OpenAPI document written to ./openapi.cache.json`);

  if (skipScalar) return;

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
