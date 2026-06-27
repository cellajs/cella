import fs from 'node:fs/promises';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { appConfig } from 'shared';
import type { Env } from '#/core/context';
import { buildExtensionEntries } from '#/core/extensions';
import { getRegisteredTags } from '#/core/tag-registry';
import { getExtensionValueMetadata } from '#/core/x-middleware';
import { membershipBaseSchema } from '#/modules/memberships/memberships-schema';
import { errorResponses, productEntityBaseSchema, registerAllErrorResponses } from '#/schemas';
import { contextEntityBaseSchema } from '#/schemas/entity-base';
import { streamNotificationSchema } from '#/schemas/stream-schemas';
import { stxBaseSchema } from '#/schemas/sync-transaction-schemas';
import { userMinimalBaseSchema } from '#/schemas/user-minimal-base';
import { userBaseSchema } from '#/schemas/user-schema-base';

/** Register OpenAPI schemas, write the spec to disk, and mount the /openapi.json endpoint */
const initDocs = async (app: OpenAPIHono<Env>) => {
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
    name: `${appConfig.slug}-session-${appConfig.cookieVersion}`,
    description:
      "Authentication cookie. Copy cookie from your network tab and paste it here. If you don't have it, you need to sign in or sign up first.",
  });

  // Register base schemas (not auto-registered as they're only used for extending other schemas)
  registry.register('UserMinimalBase', userMinimalBaseSchema);
  registry.register('UserBase', userBaseSchema);
  registry.register('ContextEntityBase', contextEntityBaseSchema);
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

  // Validate that every `x-tags` value on a component schema is a registered tag.
  // Catches typos at boot instead of silently breaking docs grouping downstream.
  validateSchemaTags(openApiDoc as unknown as Record<string, unknown>);

  // Strip trailing /flags from pattern strings (zod-openapi includes flag suffix; JSON Schema doesn't).
  stripRegexFlagsFromPatterns(openApiDoc as unknown as Record<string, unknown>);

  const tmpPath = './openapi.cache.json.tmp';
  await fs.writeFile(tmpPath, JSON.stringify(openApiDoc, null, 2));
  await fs.rename(tmpPath, './openapi.cache.json');
};

/**
 * Validate that every `x-tags` entry on a component schema refers to a tag
 * registered in the tag registry. Throws on the first violation so misconfig
 * surfaces at boot instead of silently producing miscategorized docs.
 */
const validateSchemaTags = (doc: Record<string, unknown>) => {
  const known = new Set(getRegisteredTags().map((t) => t.tag));
  const components = (doc.components as Record<string, unknown> | undefined) ?? {};
  const schemas = (components.schemas as Record<string, Record<string, unknown>> | undefined) ?? {};

  for (const [name, schema] of Object.entries(schemas)) {
    const tags = schema['x-tags'];
    if (tags === undefined) continue;
    if (!Array.isArray(tags)) throw new Error(`Schema "${name}" has non-array x-tags`);
    for (const t of tags) {
      if (typeof t !== 'string' || !known.has(t)) {
        throw new Error(`Schema "${name}" references unknown x-tag "${String(t)}". Register it in tag-registry.ts.`);
      }
    }
  }
};

export default initDocs;

/**
 * Walk the spec and strip a trailing `/<flags>` suffix from any `pattern`
 * string. zod-openapi serializes RegExp via `String(re)` which yields
 * `^foo$/u`; JSON Schema patterns are ECMA-262 source-only.
 */
const FLAG_SUFFIX = /\/[gimsuy]+$/;
const stripRegexFlagsFromPatterns = (node: unknown): void => {
  if (Array.isArray(node)) {
    for (const item of node) stripRegexFlagsFromPatterns(item);
    return;
  }
  if (node === null || typeof node !== 'object') return;
  const obj = node as Record<string, unknown>;
  if (typeof obj.pattern === 'string' && FLAG_SUFFIX.test(obj.pattern)) {
    obj.pattern = obj.pattern.replace(FLAG_SUFFIX, '');
  }
  for (const v of Object.values(obj)) stripRegexFlagsFromPatterns(v);
};
