import { appConfig } from 'shared';
import type { ErrorKey } from '#/core/error';
import { documentResources } from '#/core/openapi-resources';
import { getRegisteredTags } from '#/core/openapi-tag-registry';
import { errorResponseComponents, problemJsonType } from '#/schemas/error-response-schemas';

/** Rules for whoever writes routes are checked where routes are written and tested; a deployed backend never fails on one. */
export const checksAuthoringRules = appConfig.mode === 'development' || appConfig.mode === 'test';

/** The parts of a generated OpenAPI document these checks read. */
export type OpenApiDocument = { components?: { schemas?: Record<string, unknown> }; paths?: Record<string, unknown> };

/**
 * Normalize generated OpenAPI fields that need source-library compatibility fixes, fold the shared error responses into
 * their `$ref`s, give custom methods and updates their AEP form, and annotate the resources.
 */
export const normalizeOpenApiDocument = (doc: OpenApiDocument) => {
  stripRegexFlagsFromPatterns(doc);
  foldErrorResponses(doc);
  documentCustomMethods(doc);
  documentMergePatch(doc);
  documentResources(doc);
};

/**
 * Verbs routes declare as custom methods. A router matches no literal after a path param, so a route declares the
 * custom method `:verb` at the routable path `/~verb`, and the server rewrites a request for `<resource>:<verb>` to it.
 */
const customVerbs = new Set<string>();

export const recordCustomVerb = (verb: string) => {
  customVerbs.add(verb);
};

/** A last segment `<resource>:<verb>`, the colon sent as is or percent-encoded. */
const customMethodSuffix = /(?::|%3[aA])([a-z][a-z0-9-]*)$/;

/**
 * The routable path of a request path that ends in a custom method a route declares: `<x>:<verb>` as `<x>/~<verb>`.
 * @returns Undefined for any other path, so a param value holding a colon reaches its route as sent.
 */
export const routablePath = (path: string): string | undefined => {
  const match = customMethodSuffix.exec(path);
  return match && customVerbs.has(match[1]) ? `${path.slice(0, match.index)}/~${match[1]}` : undefined;
};

/** A path as clients send it: a custom method's routable `/~verb` as `:verb`. */
export const clientPath = (path: string) => path.replace(/\/~([a-z][a-z0-9-]*)$/, ':$1');

/** The paths of the document as clients send them. */
const documentCustomMethods = (doc: OpenApiDocument) => {
  if (!doc.paths) return;
  doc.paths = Object.fromEntries(Object.entries(doc.paths).map(([path, item]) => [clientPath(path), item]));
};

type RequestBodyNode = { content?: Record<string, unknown> };

/** Update bodies of field operations with their timestamps (`{ ops, stx }`), which the sync engine merges field by field. */
const fieldOperationBodies = new WeakSet<object>();

/** Marks a product update body as field operations, so its route is not documented as taking a merge patch. */
export const markFieldOperations = <S extends object>(schema: S): S => {
  fieldOperationBodies.add(schema);
  return schema;
};

/** The `operationId`s of patch routes whose body is field operations. */
const fieldOperationUpdates = new Set<string>();

export const recordPatchBody = (operationId: string, body: unknown) => {
  if (typeof body === 'object' && body !== null && fieldOperationBodies.has(body)) fieldOperationUpdates.add(operationId);
};

/**
 * An update takes a JSON Merge Patch (RFC 7396): the JSON body validator accepts every `+json` media type, so a patch
 * route's `application/json` body is documented as `application/merge-patch+json` too. A product update takes field
 * operations (`markFieldOperations`) and is left as it is.
 */
const documentMergePatch = (doc: OpenApiDocument) => {
  const paths = (doc.paths ?? {}) as Record<string, { patch?: { operationId?: string; requestBody?: RequestBodyNode } }>;
  for (const { patch } of Object.values(paths)) {
    const content = patch?.requestBody?.content;
    if (patch?.operationId && fieldOperationUpdates.has(patch.operationId)) continue;
    if (content?.['application/json']) content['application/merge-patch+json'] = content['application/json'];
  }
};

/** Per `operationId`, the error statuses its route documents. */
const documentedErrorStatuses = new Map<string, ReadonlySet<number>>();

export const recordDocumentedErrors = (operationId: string, statuses: number[]) => {
  documentedErrorStatuses.set(operationId, new Set(statuses));
};

/**
 * The authoring mistake behind an error status a route answers without documenting it, as a message naming the fix.
 * @returns Undefined for a documented status, a request no `createXRoute` route matched, or an answer no route documents
 * on its own: a server error, and the 409 `write_conflict` the database gives any transaction a concurrent one beat.
 */
export const undocumentedErrorStatus = (operationId: string | undefined, status: number, type: ErrorKey): string | undefined => {
  if (!operationId || status >= 500 || type === 'write_conflict') return undefined;
  const documented = documentedErrorStatuses.get(operationId);
  if (!documented || documented.has(status)) return undefined;
  return `${operationId} answered ${status}, which its route does not document: spread errors(${status}) into its responses, or let the guard, limiter or lock that refuses with it declare it in errors.`;
};

/** The boot check of the generated document: every `x-tags` entry must name a registered tag. Throws on the first violation. */
export const validateOpenApiDocument = (doc: OpenApiDocument) => {
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
        const name = response.content?.[problemJsonType]?.schema?.$ref?.split('/').pop();
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
  if (typeof obj.pattern === 'string' && flagSuffix.test(obj.pattern)) obj.pattern = obj.pattern.replace(flagSuffix, '');
  for (const v of Object.values(obj)) stripRegexFlagsFromPatterns(v);
};
