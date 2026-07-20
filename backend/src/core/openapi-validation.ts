import { getRegisteredTags } from '#/core/openapi-tag-registry';

/** Validate the generated OpenAPI document before exposing or caching the spec. */
const validateOpenApiDocument = (doc: Record<string, unknown>) => {
  validateSchemaTags(doc);
};

/** Normalize generated OpenAPI fields that need source-library compatibility fixes. */
const normalizeOpenApiDocument = (doc: Record<string, unknown>) => {
  stripRegexFlagsFromPatterns(doc);
};

/**
 * Validate that every `x-tags` entry on a component schema refers to a tag
 * registered in the tag registry. Throws on the first violation so misconfig
 * surfaces at boot before it can silently produce miscategorized docs.
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
        throw new Error(
          `Schema "${name}" references unknown x-tag "${String(t)}". Register it in openapi-tag-registry.ts.`,
        );
      }
    }
  }
};

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

export { normalizeOpenApiDocument, validateOpenApiDocument };
