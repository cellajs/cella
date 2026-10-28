import { appConfig } from 'shared';
import { getRegisteredTags } from '#/core/openapi-tag-registry';
import { errorResponseComponents } from '#/schemas/error-response-schemas';

/** Rules for whoever writes routes are checked where routes are written and tested; a deployed backend never fails on one. */
export const checksAuthoringRules = appConfig.mode === 'development' || appConfig.mode === 'test';

/** The parts of a generated OpenAPI document these checks read. */
type OpenApiDocument = { components?: { schemas?: Record<string, unknown> }; paths?: Record<string, unknown> };

/** The boot checks of the generated document: its schema tags, and its route examples where authoring rules are checked. */
export const validateOpenApiDocument = (doc: OpenApiDocument) => {
  validateSchemaTags(doc);
  if (checksAuthoringRules) validateRouteExamples(doc);
};

/** Normalize generated OpenAPI fields that need source-library compatibility fixes, and fold the shared error responses into their `$ref`s. */
export const normalizeOpenApiDocument = (doc: OpenApiDocument) => {
  stripRegexFlagsFromPatterns(doc);
  foldErrorResponses(doc);
};

/** Per `operationId`, the error statuses its route documents: `createXRoute` records them, the error handler reads them where authoring rules are checked. */
const documentedErrorStatuses = new Map<string, ReadonlySet<number>>();

export const recordDocumentedErrors = (operationId: string, statuses: number[]) => {
  documentedErrorStatuses.set(operationId, new Set(statuses));
};

/**
 * The authoring mistake behind an error status a route answers without documenting it, as a message naming the fix.
 * @returns Undefined for a documented status, a request no `createXRoute` route matched, or an answer no route documents
 * on its own: a server error, and the 409 `write_conflict` the database gives any transaction a concurrent one beat.
 */
export const undocumentedErrorStatus = (operationId: string | undefined, status: number, type: string): string | undefined => {
  if (!operationId || status >= 500 || type === 'write_conflict') return undefined;
  const documented = documentedErrorStatuses.get(operationId);
  if (!documented || documented.has(status)) return undefined;
  return `${operationId} answered ${status}, which its route does not document: spread errors(${status}) into its responses, or let the guard, limiter or lock that refuses with it declare it in errors.`;
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

type ResponseNode = { $ref?: string; description?: string; content?: Record<string, { schema?: { $ref?: string } }> };

/**
 * A route carries a shared error response as a Zod-backed response, which the generator inlines per operation. Written
 * here as the `$ref` to its component (`registerAllErrorResponses`), so the document holds each error body once.
 */
const foldErrorResponses = (doc: OpenApiDocument) => {
  const paths = (doc.paths ?? {}) as Record<string, Record<string, { responses?: Record<string, ResponseNode> }>>;
  for (const pathItem of Object.values(paths)) {
    for (const { responses } of Object.values(pathItem)) {
      for (const [status, response] of Object.entries(responses ?? {})) {
        if (response.$ref || !responses) continue;
        const name = response.content?.['application/json']?.schema?.$ref?.split('/').pop();
        if (name && errorResponseComponents.get(name) === response.description) responses[status] = { $ref: `#/components/responses/${name}` };
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
