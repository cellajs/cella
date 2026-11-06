import { z } from '@hono/zod-openapi';
import { type TOptions, t } from 'i18next';
import { appConfig } from 'shared';
import { isCDNUrl } from 'shared/utils/is-cdn-url';
import type { ErrorKey } from '#/core/error';
import { maxLength } from '#/db/utils/constraints';
import countries from '#json/countries.json';

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
 * @param key - Translation key, e.g. 'error:invalid_skip'.
 * @param options - Interpolation values.
 */
export const translatedError = (key: `error:${ErrorKey}`, options?: TOptions) => ({ error: () => t(key, options) });

export const validIdSchema = z.string().max(maxLength.id);

export const validTempIdSchema = z
  .string()
  .max(maxLength.id)
  .regex(/^temp-/, { message: 'ID must start with "temp-"' });

export const cookieSchema = z.string().max(maxLength.field);

export const languageSchema = z.enum(appConfig.languages);

const countryCodes = new Set(countries.map(({ code }) => code));

/** An ISO 3166-1 alpha-2 code that `json/countries.json` lists, the codes the country field offers. */
export const countryCodeSchema = z
  .string()
  .max(2)
  .regex(/^[A-Z]{2}$/, translatedError('error:invalid_country'))
  .refine((code) => countryCodes.has(code), translatedError('error:invalid_country'))
  .openapi({ description: 'ISO 3166-1 alpha-2 country code.', example: 'NL' });

const isTimeZone = (zone: string) => {
  try {
    return !!new Intl.DateTimeFormat('en-US', { timeZone: zone }).resolvedOptions().timeZone;
  } catch {
    return false;
  }
};

/** An IANA time zone id the runtime knows, an alias such as Asia/Calcutta included. */
export const timeZoneSchema = z
  .string()
  .max(maxLength.field)
  .refine(isTimeZone, translatedError('error:invalid_timezone'))
  .openapi({ description: 'IANA time zone id.', example: 'Europe/Amsterdam' });

export const tenantOnlyParamSchema = z.object({ tenantId: validIdSchema });

/** Tenant- and organization-scoped params, for RLS-enabled routes. */
export const tenantOrgParamSchema = z.object({ tenantId: validIdSchema, organizationId: validIdSchema });

/** The path of one user: cross-tenant, a relatability check or system admin access decides. */
export const userIdParamSchema = z.object({ userId: validIdSchema });

/** A channel entity by type and id, as the membership routes name it in the query or the body. */
export const entityWithTypeSchema = z.object({ entityId: validIdSchema, entityType: channelEntityTypeSchema });

/** The largest page a list returns; a larger `maxPageSize` coerces down to it. */
const pageSizeCap = 1000;

/**
 * A non-negative integer query param, `integer` in the docs and the SDK. Only a string of digits converts, so `''`,
 * `-1` and `1.5` fail with `error`; `z.coerce` would turn `''` and null into 0.
 */
export const integerQuerySchema = (error?: ReturnType<typeof translatedError>) =>
  z.preprocess((value) => (typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value), z.int(error).min(0, error));

/** A list's sort direction. */
export const orderSchema = z.enum(['asc', 'desc']);

export type OrderDirection = z.infer<typeof orderSchema>;

/**
 * The most results one page holds (AEP-158): absent or 0 reads the configured default, above `max` it coerces down to
 * `max`, and a negative value fails.
 */
export const maxPageSizeSchema = (max: number) => {
  const fallback = Math.min(appConfig.requestLimits.default, max);
  return integerQuerySchema(translatedError('error:invalid_page_size'))
    .optional()
    .transform((size) => Math.min(size || fallback, max))
    .describe(`Most results one page holds. Absent or 0 reads ${fallback}; above ${max} reads ${max}. A page may hold fewer.`);
};

/** The paging params of a list (AEP-158): a page token, a page size and results to skip. */
export const pageQuerySchema = z.object({
  pageToken: z
    .string()
    .max(maxLength.url)
    .optional()
    .describe("The previous page's `nextPageToken`. Every other param except `maxPageSize` and `skip` must match the request that returned it."),
  maxPageSize: maxPageSizeSchema(pageSizeCap),
  skip: integerQuerySchema(translatedError('error:invalid_skip'))
    .default(0)
    .describe("Results to pass over after the page token's position, or from the start without a token."),
});

/** Paging and search: what every list that searches takes. */
export const listQuerySchema = pageQuerySchema.extend({
  q: z
    .string()
    .max(maxLength.field)
    .optional()
    .describe(
      'Search, case- and accent-insensitive. Every word must appear in a searched field; "quotes" keep a phrase together and a leading - leaves out items holding that whole word or phrase.',
    ),
});

/**
 * A list's `orderBy` (AEP-132): one of `fields`, then `asc` or `desc`, ascending when left out. Its values form an enum,
 * so the docs and the SDK name each one. It parses to the `sort` and `order` that `getOrderColumns` takes.
 * @param fallback the order when the param is absent
 */
export const orderByQuerySchema = <const F extends readonly string[]>(fields: F, fallback: `${F[number]} ${OrderDirection}`) => {
  const sortSchema = z.enum(fields);
  const values = fields.flatMap((field) => [field, `${field} asc`, `${field} desc`]);
  return z
    .enum(values, translatedError('error:invalid_order_by', { fields: fields.join(', ') }))
    .default(fallback)
    .transform((value) => {
      const [sort, order = 'asc'] = value.split(' ');
      return { sort: sortSchema.parse(sort), order: orderSchema.parse(order) };
    })
    .openapi({ description: 'A field to order by, then `asc` or `desc`; ascending when left out.', example: fallback });
};

const seqRangeShape = {
  afterSeq: integerQuerySchema().optional().describe('Range read for sync: return the rows stamped after this sequence position. Requires untilSeq.'),
  untilSeq: integerQuerySchema().optional().describe('Range read for sync: the last sequence position to return. Requires afterSeq.'),
};

type SeqRangeQuery = { afterSeq?: number; untilSeq?: number; q?: string; pageToken?: string; skip: number };

/** A range read pairs both bounds and takes no search, no page token and no skip. */
const refineSeqRange = ({ afterSeq, untilSeq, q, pageToken, skip }: SeqRangeQuery, ctx: z.RefinementCtx) => {
  if (afterSeq === undefined && untilSeq === undefined) return;
  if (afterSeq === undefined || untilSeq === undefined) {
    ctx.addIssue({ code: 'custom', path: [afterSeq === undefined ? 'afterSeq' : 'untilSeq'], message: 'A range read needs afterSeq and untilSeq' });
  } else if (afterSeq >= untilSeq) {
    ctx.addIssue({ code: 'custom', path: ['untilSeq'], message: 'untilSeq must be higher than afterSeq' });
  }
  if (q?.trim()) ctx.addIssue({ code: 'custom', path: ['q'], message: 'A range read takes no search' });
  if (pageToken || skip > 0)
    ctx.addIssue({
      code: 'custom',
      path: [pageToken ? 'pageToken' : 'skip'],
      message: 'A range read takes no page token and no skip: the next chunk starts after the last position received',
    });
};

/**
 * A product list query: paging, search, `afterSeq` and `untilSeq`, and the product's own params in `shape`. With both
 * bounds it is a range read for sync: the rows stamped with a sequence position in (afterSeq, untilSeq], deleted rows
 * included, in sequence order. A range read takes no search, no page token and no skip; the next chunk starts after the
 * last position received.
 */
export const productListQuerySchema = <T extends z.ZodRawShape>(shape: T) =>
  listQuerySchema
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

/**
 * A list in one query key, comma-separated: `?include=counts,membership`. Absent reads as an empty array and a value
 * `item` refuses answers 400. The frontend writes the same form through `csvSearchParam`.
 * @param item schema of one value, which holds no comma
 * @param maxItems most values one request names; default 50
 */
export const csvQuerySchema = <T extends z.ZodType<unknown, string>>(item: T, maxItems = 50) =>
  z
    .string()
    .max(maxLength.url)
    .optional()
    .transform((value) =>
      value
        ? value
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean)
        : [],
    )
    .pipe(z.array(item).max(maxItems))
    .openapi({ description: 'Comma-separated values' });

export const includeQuerySchema = csvQuerySchema(z.enum(includeOptions));

export const slugIncludeQuerySchema = z.object({ slug: booleanTransformSchema.optional(), include: includeQuerySchema });

/** A body naming one to `maxItems` rows by id. */
export const idsBodySchema = (maxItems = 50) =>
  z.object({
    ids: z
      .array(validIdSchema)
      .min(1, translatedError('error:invalid_min_items', { min: 'one', name: 'ID' }))
      .max(maxItems, translatedError('error:invalid_max_items', { max: maxItems, name: 'ID' })),
  });

/** The `Location` header of a redirect. */
export const locationSchema = z.object({ Location: z.string() });

/**
 * superRefine validator carrying a custom error type, which `defaultHook` reads from `params.type` for i18n.
 * @param errorType - Translation key, e.g. 'invalid_slug'.
 */
export const refineWithType =
  <T>(check: (val: T) => boolean, errorType: ErrorKey) =>
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

/**
 * A name is free text: anything a person types except a control character (line break, tab) and the angle brackets of
 * markup. The control characters are the Unicode Cc ranges spelled as `\x` escapes, which every client's regex engine
 * reads from the spec (Python's `re` refuses `\p{Cc}`, and Go's RE2 refuses `\u`).
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: the control characters are what the pattern refuses
const namePattern = /^[^\x00-\x1F\x7F-\x9F<>]+$/;
export const validNameSchema = z
  .string()
  .trim()
  .min(1, translatedError('error:invalid_between_num', { name: 'Name', min: 1, max: maxLength.field }))
  .max(maxLength.field, translatedError('error:invalid_between_num', { name: 'Name', min: 1, max: maxLength.field }))
  .regex(namePattern, translatedError('error:invalid_name'));

/** An email address, trimmed and lowercased before it is checked; the raw input is bounded first. */
export const validEmailSchema = z
  .string()
  .max(maxLength.field, translatedError('error:invalid_between_num', { name: 'Email', min: 4, max: maxLength.field }))
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
