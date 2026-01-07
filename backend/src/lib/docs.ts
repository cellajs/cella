import fs from 'node:fs/promises';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { Scalar } from '@scalar/hono-api-reference';
import chalk from 'chalk';
import { appConfig } from 'config';
import type { Env } from '#/lib/context';
import { apiModulesList, registerAppSchema } from '#/lib/docs-config';
import { attachmentSchema } from '#/modules/attachments/schema';
import { contextEntityBaseSchema } from '#/modules/entities/schema-base';
import { inactiveMembershipSchema, membershipBaseSchema, membershipSchema } from '#/modules/memberships/schema';
import { organizationSchema } from '#/modules/organizations/schema';
import { userSchema } from '#/modules/users/schema';
import { userBaseSchema } from '#/modules/users/schema-base';
import { apiErrorSchema } from '#/utils/schema/api-error';
import { errorResponses, registerAllErrorResponses } from '#/utils/schema/error-responses';

// OpenAPI configuration
const openApiConfig = {
  servers: [{ url: appConfig.backendUrl }],
  info: {
    title: `${appConfig.name} API`,
    version: appConfig.apiVersion,
    description: appConfig.apiDescription,
  },
  openapi: '3.1.0',
  tags: apiModulesList,
};

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

  // Set security schemes
  registry.registerComponent('securitySchemes', 'cookieAuth', {
    type: 'apiKey',
    in: 'cookie',
    name: `${appConfig.slug}-session-${appConfig.apiVersion}`,
    description:
      "Authentication cookie. Copy cookie from your network tab and paste it here. If you don't have it, you need to sign in or sign up first.",
  });

  // Register lower-level (base) schemas
  registry.register('UserBase', userBaseSchema);
  registry.register('ContextEntityBase', contextEntityBaseSchema);
  registry.register('MembershipBase', membershipBaseSchema);

  // Register entity schemas
  registry.register('User', userSchema);
  registry.register('Organization', organizationSchema);
  registry.register('Membership', membershipSchema);
  registry.register('InactiveMembership', inactiveMembershipSchema);
  registry.register('Attachment', attachmentSchema);

  registry.register('ApiError', apiErrorSchema);

  // Register error responses
  registerAllErrorResponses(registry, errorResponses);

  // Register application-specific schemas
  registerAppSchema(registry);

  // Review all existing schemas
  app.doc31('/openapi.json', openApiConfig);

  // Get JSON doc and save to file
  const openApiDoc = app.getOpenAPI31Document(openApiConfig);
  await fs.writeFile('./openapi.cache.json', JSON.stringify(openApiDoc, null, 2));
  console.info(`${chalk.greenBright.bold('✔')} OpenAPI document written to ./openapi.cache.json`);

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
