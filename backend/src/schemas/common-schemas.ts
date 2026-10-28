import { z } from '@hono/zod-openapi';
import { type TOptions, t } from 'i18next';
import { appConfig } from 'shared';
import { isCDNUrl } from 'shared/utils/is-cdn-url';
import { maxLength } from '#/db/utils/constraints';

export { maxLength };

/**
 * A boolean query param: `'true'`, `'false'` or a boolean, false when absent. Unnamed, so it inlines into each query
 * param and never shows as a component schema in the docs.
 */
export const booleanTransformSchema = z
  .union([z.enum(['true', 'false']), z.boolean()])
  .default('false')
  .transform((value) => value === true || value === 'true');

export const entityTypeSchema = z.enum(appConfig.entityTypes);

export const channelEntityTypeSchema = z.enum(appConfig.channelEntityTypes);

export const productEntityTypeSchema = z.enum(appConfig.productEntityTypes);

/**
 * A zod error param translated when a value fails. Schemas are built while the routes import, before the server
 * initializes i18n, so a message translated at build time would stay zod's default.
 * @param key - Translation key, e.g. 'error:invalid_offset'.
 * @param options - Interpolation values.
 */
export const translatedError = (key: string, options?: TOptions) => ({ error: () => t(key, options) });

export const validIdSchema = z.string().max(maxLength.id);

export const validTempIdSchema = z
  .string()
  .max(maxLength.id)
  .regex(/^temp-/, { message: 'ID must start with "temp-"' });

export const cookieSchema = z.string().max(maxLength.field);

export const languageSchema = z.enum(appConfig.languages);

export const entityIdParamSchema = z.object({ id: validIdSchema });

export const tenantIdParamSchema = z.object({ tenantId: validIdSchema, id: validIdSchema });

export const tenantOnlyParamSchema = z.object({ tenantId: validIdSchema });

/** Tenant- and organization-scoped params, for RLS-enabled routes. */
export const tenantOrgParamSchema = z.object({ tenantId: validIdSchema, organizationId: validIdSchema });

export const idInTenantOrgParamSchema = z.object({ tenantId: validIdSchema, organizationId: validIdSchema, id: validIdSchema });

/** Cross-tenant routes with a relatability check. */
export const relatableUserIdParamSchema = z.object({ relatableUserId: validIdSchema });

export const entityWithTypeQuerySchema = z.object({ entityId: validIdSchema, entityType: channelEntityTypeSchema });

const limitMax = 1000;

/**
 * An integer query param, `integer` in the docs and the SDK. Only a string of digits converts, so `''`, `-1` and `1.5`
 * fail; `z.coerce` would turn `''` and null into 0.
 */
export const integerQuerySchema = ({ min = 0, max, error }: { min?: number; max?: number; error?: ReturnType<typeof translatedError> } = {}) => {
  const integer = z.int(error).min(min, error);
  return z.preprocess(
    (value) => (typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value),
    max === undefined ? integer : integer.max(max, error),
  );
};

/** Search, sort and paging: newest first from offset 0, the configured default `limit` when absent, at most 1000. */
export const paginationQuerySchema = z.object({
  q: z.string().max(maxLength.field).optional(),
  sort: z.enum(['createdAt']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  offset: integerQuerySchema({ error: translatedError('error:invalid_offset') }).default(0),
  limit: integerQuerySchema({ min: 1, max: limitMax, error: translatedError('error:invalid_limit', { max: limitMax }) }).default(
    appConfig.requestLimits.default,
  ),
});

const seqRangeShape = {
  afterSeq: integerQuerySchema().optional().describe('Range read for sync: return the rows stamped after this sequence position. Requires untilSeq.'),
  untilSeq: integerQuerySchema().optional().describe('Range read for sync: the last sequence position to return. Requires afterSeq.'),
};

type SeqRangeQuery = { afterSeq?: number; untilSeq?: number; q?: string; offset: number };

/** A range read pairs both bounds and takes no search and no offset. */
const refineSeqRange = ({ afterSeq, untilSeq, q, offset }: SeqRangeQuery, ctx: z.RefinementCtx) => {
  if (afterSeq === undefined && untilSeq === undefined) return;
  if (afterSeq === undefined || untilSeq === undefined) {
    ctx.addIssue({ code: 'custom', path: [afterSeq === undefined ? 'afterSeq' : 'untilSeq'], message: 'A range read needs afterSeq and untilSeq' });
  } else if (afterSeq >= untilSeq) {
    ctx.addIssue({ code: 'custom', path: ['untilSeq'], message: 'untilSeq must be higher than afterSeq' });
  }
  if (q?.trim()) ctx.addIssue({ code: 'custom', path: ['q'], message: 'A range read takes no search' });
  if (offset > 0)
    ctx.addIssue({
      code: 'custom',
      path: ['offset'],
      message: 'A range read takes no offset: the next chunk starts after the last position received',
    });
};

/**
 * A product list query: pagination, `afterSeq` and `untilSeq`, and the product's own params in `shape`. With both
 * bounds it is a range read for sync: the rows stamped with a sequence position in (afterSeq, untilSeq], deleted rows
 * included, in sequence order. A range read takes no search and no offset; the next chunk starts after the last
 * position received. The range rules apply last, so `shape` can redefine `sort`.
 */
export const productListQuerySchema = <T extends z.ZodRawShape>(shape: T) =>
  paginationQuerySchema
    .extend({ ...seqRangeShape, ...shape })
    // TypeScript cannot see the range and paging keys through a generic `extend`; `shape` holds the product's own params.
    .superRefine((query, ctx) => refineSeqRange(query as SeqRangeQuery, ctx));

/**
 * True returns fully hydrated relations. App product routes read it.
 * @public
 */
export const fullResponseQuerySchema = z.object({ fullResponse: booleanTransformSchema.optional() });

const includeOptions = ['counts', 'membership', 'members', 'mfa'] as const;
export type IncludeOption = (typeof includeOptions)[number];

/** Comma-separated, e.g. `?include=counts,membership`. */
export const includeQuerySchema = z
  .string()
  .optional()
  .transform((val) => (val ? val.split(',').map((s) => s.trim()) : []))
  .pipe(z.array(z.enum(includeOptions)));

export const slugIncludeQuerySchema = z.object({ slug: booleanTransformSchema.optional(), include: includeQuerySchema });

/** A body naming one to `maxItems` rows by id. */
export const idsBodySchema = (maxItems = 50) =>
  z.object({
    ids: z
      .array(z.string())
      .min(1, translatedError('error:invalid_min_items', { min: 'one', name: 'ID' }))
      .max(maxItems, translatedError('error:invalid_max_items', { max: maxItems, name: 'ID' })),
  });

/** The optional stx is what prevents echoing the change back to its source. */
export const idsWithStxBodySchema = (maxItems = 50) =>
  idsBodySchema(maxItems).extend({ stx: z.object({ mutationId: z.string(), sourceId: z.string() }).optional() });

/** The `Location` header of a redirect. */
export const locationSchema = z.object({ Location: z.string() });

/**
 * superRefine validator carrying a custom error type, which `defaultHook` reads from `params.type` for i18n.
 * @param errorType - Translation key, e.g. 'invalid_slug'.
 */
export const refineWithType =
  <T>(check: (val: T) => boolean, errorType: string) =>
  (val: T, ctx: z.RefinementCtx) => {
    if (!check(val)) {
      ctx.addIssue({ code: 'custom', message: t(`error:${errorType}`), input: val, params: { type: errorType } });
    }
  };

export const validUuidSchema = z.uuid(translatedError('error:invalid_id'));

/** A bounded list of ids that names each row once: the ids a body picks, or the rows a host row relates to. */
export const uniqueIdsSchema = (maxItems = 50) =>
  validUuidSchema
    .array()
    .max(maxItems)
    .refine((ids) => new Set(ids).size === ids.length, 'IDs must be unique');

/**
 * A string-keyed record that holds at most `maxKeys` keys. `z.record` has no size check, so the count is checked before
 * any value parses: an oversized record fails with one issue, not one per failing value.
 * @public
 */
export const boundedRecord = <V extends z.ZodType>(value: V, maxKeys: number) =>
  z
    .preprocess(
      (input, ctx) => {
        if (input && typeof input === 'object' && Object.keys(input).length > maxKeys) {
          ctx.addIssue({ code: 'custom', message: `At most ${maxKeys} keys` });
        }
        return input;
      },
      z.record(z.string(), value),
    )
    .openapi({ maxProperties: maxKeys });

/** A refine predicate: no two items share a slug. */
export const noDuplicateSlugsRefine = (items: { slug: string }[]) => new Set(items.map((i) => i.slug)).size === items.length;

/** Scheme and host are case-insensitive; userinfo, path, query and fragment are not, so they keep their case. */
const lowercaseSchemeAndHost = (url: string) => {
  const match = /^([a-z][a-z\d+.-]*:\/\/)([^/\\?#]*)(.*)$/is.exec(url);
  if (!match) return url;
  const [, scheme, authority, rest] = match;
  const hostStart = authority.lastIndexOf('@') + 1;
  return `${scheme.toLowerCase()}${authority.slice(0, hostStart)}${authority.slice(hostStart).toLowerCase()}${rest}`;
};

/** An https URL, trimmed, with its scheme and host lowercased. */
export const validUrlSchema = z
  .string()
  .max(maxLength.url)
  .startsWith('https://', translatedError('error:invalid_url'))
  .transform((str) => lowercaseSchemeAndHost(str.trim()));

/** A name is free text: anything a person types except a control character (line break, tab) and the angle brackets of markup. */
const namePattern = /^[^\p{Cc}<>]+$/u;
export const validNameSchema = z
  .string()
  .trim()
  .min(1, translatedError('error:invalid_between_num', { name: 'Name', min: 1, max: maxLength.field }))
  .max(maxLength.field, translatedError('error:invalid_between_num', { name: 'Name', min: 1, max: maxLength.field }))
  .regex(namePattern, translatedError('error:invalid_name'));

/** An email address, trimmed and lowercased before it is checked. */
export const validEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(
    z
      .email(translatedError('error:invalid_email'))
      .min(4, translatedError('error:invalid_between_num', { name: 'Email', min: 4, max: maxLength.field }))
      .max(maxLength.field, translatedError('error:invalid_between_num', { name: 'Email', min: 4, max: maxLength.field })),
  )
  .openapi({ type: 'string', format: 'email', minLength: 4, maxLength: maxLength.field });

const canonicalDomainPattern = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
/** A host name with at least one dot, trimmed and lowercased before it is checked. */
export const validDomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(
    z
      .string()
      .min(4, translatedError('error:invalid_between_num', { name: 'Domain', min: 4, max: maxLength.field }))
      .max(maxLength.field, translatedError('error:invalid_between_num', { name: 'Domain', min: 4, max: maxLength.field }))
      .regex(canonicalDomainPattern, translatedError('error:invalid_domain')),
  )
  .openapi({ type: 'string', format: 'hostname', minLength: 4, maxLength: maxLength.field, pattern: canonicalDomainPattern.source });

// Both cases are spelled out: an OpenAPI pattern carries no flags, so a case-insensitive regex would publish a pattern
// that refuses the upper-case slug this schema takes and lowers. Each group starts with a dash: a group that may start
// without one splits a run of letters in every possible way, and a refused slug backtracks exponentially.
const slugPattern = /^[a-zA-Z0-9]+(-{1,3}[a-zA-Z0-9]+)*$/;
/** A slug of 2 to 255 characters, lowercased once it is checked. */
export const validSlugSchema = z
  .string()
  .min(2, translatedError('error:invalid_between_num', { name: 'Slug', min: 2, max: maxLength.field }))
  .max(maxLength.field, translatedError('error:invalid_between_num', { name: 'Slug', min: 2, max: maxLength.field }))
  .regex(slugPattern, translatedError('error:invalid_slug'))
  .transform((str) => str.toLowerCase().trim());

/**
 * superRefine, because the allowed CDN hosts come from runtime config and cannot be a static JSON-schema pattern.
 * Trimmed before the check, so the stored value is the one that was validated.
 */
export const validCDNUrlSchema = z
  .string()
  .trim()
  .max(maxLength.url)
  .superRefine(refineWithType((url: string) => isCDNUrl(url), 'invalid_cdn_url'));
