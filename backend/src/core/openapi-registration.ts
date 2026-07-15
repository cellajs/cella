import fs from 'node:fs/promises';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { appConfig } from 'shared';
import type { Env } from '#/core/context';
import { buildExtensionEntries } from '#/core/openapi-extensions';
import { getRegisteredTags } from '#/core/openapi-tag-registry';
import { normalizeOpenApiDocument, validateOpenApiDocument } from '#/core/openapi-validation';
import { getExtensionValueMetadata } from '#/core/x-middleware';
import { authCookieName } from '#/modules/auth/general/helpers/cookie';
import { membershipBaseSchema } from '#/modules/memberships/memberships-schema';
import { errorResponses, productEntityBaseSchema, registerAllErrorResponses } from '#/schemas';
import { channelEntityBaseSchema } from '#/schemas/entity-base';
import { streamNotificationSchema } from '#/schemas/stream-schemas';
import { stxBaseSchema } from '#/schemas/sync-transaction-schemas';
import { userMinimalBaseSchema } from '#/schemas/user-minimal-base';
import { userBaseSchema } from '#/schemas/user-schema-base';

/** Register OpenAPI schemas, write the spec to disk, and mount the /openapi.json endpoint. */
const registerOpenApiDocs = async (app: OpenAPIHono<Env>) => {
  const registry = app.openAPIRegistry;

  // Build extension entries with collected value metadata
  const extensions = buildExtensionEntries(getExtensionValueMetadata());

  // OpenAPI configuration
  const openApiConfig = {
    servers: [{ url: appConfig.backendUrl }],
    info: {
      title: `${appConfig.name} API`,
      version: appConfig.apiVersion,
      description: appConfig.apiDescription,
      'x-extensions': extensions,
    },
    openapi: '3.1.0',
    // Tag registry provides ordered tags with optional 3.2.0 fields (summary, parent, kind, externalDocs).
    tags: getRegisteredTags().map((t) => ({
      name: t.tag,
      description: t.description,
      ...(t.summary && { summary: t.summary }),
      ...(t.parent && { parent: t.parent }),
      ...(t.kind && { kind: t.kind }),
      ...(t.externalDocs && { externalDocs: t.externalDocs }),
      ...(t.default && { 'x-default': true }),
    })) as { name: string; description: string }[],
  };

  // Set security schemes
  registry.registerComponent('securitySchemes', 'cookieAuth', {
    type: 'apiKey',
    in: 'cookie',
    name: authCookieName('session'),
    description:
      "Authentication cookie. Copy cookie from your network tab and paste it here. If you don't have it, you need to sign in or sign up first.",
  });

  // Register base schemas (not auto-registered as they're only used for extending other schemas)
  registry.register('UserMinimalBase', userMinimalBaseSchema);
  registry.register('UserBase', userBaseSchema);
  registry.register('ChannelEntityBase', channelEntityBaseSchema);
  registry.register('ProductEntityBase', productEntityBaseSchema);
  registry.register('MembershipBase', membershipBaseSchema);
  registry.register('StxBase', stxBaseSchema);
  registry.register('StreamNotification', streamNotificationSchema);

  // Register error responses
  registerAllErrorResponses(registry, errorResponses);

  // Review all existing schemas
  app.doc31('/openapi.json', openApiConfig);

  // Get JSON doc and save to file
  const openApiDoc = app.getOpenAPI31Document(openApiConfig);

  validateOpenApiDocument(openApiDoc as unknown as Record<string, unknown>);
  normalizeOpenApiDocument(openApiDoc as unknown as Record<string, unknown>);

  const cachePath = './openapi.cache.json';
  const nextDoc = JSON.stringify(openApiDoc, null, 2);

  try {
    const currentDoc = await fs.readFile(cachePath, 'utf-8');
    if (currentDoc === nextDoc) return;
  } catch {
    // Cache does not exist yet or cannot be read; write a fresh copy below.
  }

  const tmpPath = './openapi.cache.json.tmp';
  await fs.writeFile(tmpPath, nextDoc);
  await fs.rename(tmpPath, cachePath);
};

export { registerOpenApiDocs };
