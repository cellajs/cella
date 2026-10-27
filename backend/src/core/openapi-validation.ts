import { appConfig } from 'shared';
import { getRegisteredTags } from '#/core/openapi-tag-registry';

/** Rules for whoever writes routes are checked where routes are written and tested; a deployed backend never fails on one. */
const checksAuthoringRules = appConfig.mode === 'development' || appConfig.mode === 'test';

/** The parts of a generated OpenAPI document these checks read. */
type OpenApiDocument = { components?: { schemas?: Record<string, unknown> }; paths?: Record<string, unknown> };

const validateOpenApiDocument = (doc: OpenApiDocument) => {
  validateSchemaTags(doc);
  if (checksAuthoringRules) validateRouteExamples(doc);
};

/** Normalize generated OpenAPI fields that need source-library compatibility fixes. */
const normalizeOpenApiDocument = (doc: OpenApiDocument) => {
  stripRegexFlagsFromPatterns(doc);
};

/** Every `x-tags` entry must name a registered tag. Throws at boot on the first violation. */
const validateSchemaTags = (doc: OpenApiDocument) => {
  const known = new Set(getRegisteredTags().map((t) => t.tag));
  const schemas = (doc.components?.schemas ?? {}) as Record<string, Record<string, unknown>>;

  for (const [name, schema] of Object.entries(schemas)) {
    const tags = schema['x-tags'];
    if (tags === undefined) continue;
    if (!Array.isArray(tags)) throw new Error(`Schema "${name}" has non-array x-tags`);
    for (const t of tags) {
      if (typeof t !== 'string' || !known.has(t)) {
        throw new Error(`Schema "${name}" references unknown x-tag "${String(t)}". Register it in openapi-tag-registry.ts.`);
      }
    }
  }
};

type MediaType = { schema?: { $ref?: string }; example?: unknown };
type Operation = { responses?: Record<string, { content?: Record<string, MediaType> }> };

/**
 * A route gives its own response example only where it differs from its schema's example, so the one that does stands
 * out (and wins in the docs). A copy of the schema's example throws on the first violation, in development and tests.
 */
const validateRouteExamples = (doc: OpenApiDocument) => {
  const schemas = (doc.components?.schemas ?? {}) as Record<string, { example?: unknown }>;
  const paths = (doc.paths ?? {}) as Record<string, Record<string, Operation>>;

  for (const [path, pathItem] of Object.entries(paths)) {
    for (const [method, operation] of Object.entries(pathItem)) {
      for (const [status, response] of Object.entries(operation.responses ?? {})) {
        for (const media of Object.values(response.content ?? {})) {
          const name = media.schema?.$ref?.split('/').pop();
          const schemaExample = name ? schemas[name]?.example : undefined;
          if (media.example === undefined || schemaExample === undefined) continue;
          if (JSON.stringify(media.example) === JSON.stringify(schemaExample)) {
            throw new Error(
              `${method.toUpperCase()} ${path} ${status} repeats the example of schema "${name}": drop the example argument of its json() response.`,
            );
          }
        }
      }
    }
  }
};

/** zod-openapi serializes RegExp via `String(re)`, yielding `^foo$/u`; JSON Schema patterns are source-only. */
const flagSuffix = /\/[gimsuy]+$/;
const stripRegexFlagsFromPatterns = (node: unknown): void => {
  if (Array.isArray(node)) {
    for (const item of node) stripRegexFlagsFromPatterns(item);
    return;
  }
  if (node === null || typeof node !== 'object') return;
  const obj = node as Record<string, unknown>;
  if (typeof obj.pattern === 'string' && flagSuffix.test(obj.pattern)) {
    obj.pattern = obj.pattern.replace(flagSuffix, '');
  }
  for (const v of Object.values(obj)) stripRegexFlagsFromPatterns(v);
};

export { checksAuthoringRules, normalizeOpenApiDocument, validateOpenApiDocument };
