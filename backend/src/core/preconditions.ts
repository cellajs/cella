import { createHash } from 'node:crypto';
import { type RouteConfig, z } from '@hono/zod-openapi';
import { type SQL, sql } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import type { MiddlewareHandler } from 'hono';
import { appConfig, type ChannelEntityType, hierarchy, type ProductEntityType } from 'shared';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { checksAuthoringRules } from '#/core/openapi-validation';
import { maxLength } from '#/db/utils/constraints';
import { getEntityTable } from '#/tables';
import { log } from '#/utils/logger';

type SingleEntityType = ChannelEntityType | ProductEntityType;

/** `*`, or the listed entity tags as their opaque text and whether they were weak (`W/`). */
type TagList = '*' | { opaque: string; weak: boolean }[];

/** A write's `If-Match` and `If-None-Match`, set by the precondition middleware for the read of the row its path names. */
export type WritePreconditions = {
  entityType: SingleEntityType;
  /** The path's id param, before validation. */
  id: string;
  ifMatch?: TagList;
  ifNoneMatch?: TagList;
  evaluated: boolean;
  /** The row and `updatedAt` a listed tag was compared with, which `preconditionWhere` keeps the write of that row to. */
  pinned?: { id: string; updatedAt: string | null };
};

export type PreconditionContext = { var: Pick<Env['Variables'], 'preconditions'> };

/** What `createXRoute` reads off a route that acts on one channel or product. */
export type PreconditionTarget = {
  entityType: SingleEntityType;
  param: string;
  write: boolean;
  /** The route's 200 is the entity itself, so it carries the entity tag. */
  representation: boolean;
};

/** The strong entity tag of one version of a channel or product, opaque to clients: every write moves `updatedAt`. */
const entityTag = (entityType: string, id: string, updatedAt: string | null) =>
  `"${createHash('sha256')
    .update(`${entityType}\n${id}\n${updatedAt ?? ''}`)
    .digest('base64url')
    .slice(0, 22)}"`;

/** One list element of entity tags (RFC 9110 section 8.8.3) with the separator after it. */
const listedTag = /\s*(W\/)?"([\x21\x23-\x7e\x80-\xff]*)"\s*(?:,[\s,]*|$)/y;

/** @returns Undefined for a value that is neither `*` nor a list of at least one entity tag, or longer than a field. */
const parseTagList = (value: string): TagList | undefined => {
  if (value.length > maxLength.field) return undefined;
  const list = value.replace(/^[\s,]+/, '');
  if (list.trim() === '*') return '*';
  const tags: { opaque: string; weak: boolean }[] = [];
  listedTag.lastIndex = 0;
  while (listedTag.lastIndex < list.length) {
    const match = listedTag.exec(list);
    if (!match) return undefined;
    tags.push({ opaque: match[2], weak: !!match[1] });
  }
  return tags.length ? tags : undefined;
};

const strongMatch = (list: TagList, tag: string) => list === '*' || list.some(({ opaque, weak }) => !weak && `"${opaque}"` === tag);
const weakMatch = (list: TagList, tag: string) => list === '*' || list.some(({ opaque }) => `"${opaque}"` === tag);

const preconditionFailed = (entityType: SingleEntityType) => new AppError(412, 'precondition_failed', 'info', { entityType });

/**
 * Evaluates a write's preconditions once, against the row its path names, in the read that authorizes the write
 * (`getValidProduct`, `getValidChannel`): after the 404 and 403 checks, as RFC 9110 orders them.
 * @throws AppError 412 `precondition_failed` when the row's tag fails `If-Match` or matches `If-None-Match`.
 */
export const checkPreconditions = (ctx: PreconditionContext, entityType: string, row: { id: string; updatedAt: string | null }) => {
  const conditions = ctx.var.preconditions;
  if (!conditions || conditions.evaluated || conditions.entityType !== entityType || conditions.id.toLowerCase() !== row.id) return;
  conditions.evaluated = true;
  const tag = entityTag(entityType, row.id, row.updatedAt);
  const { ifMatch, ifNoneMatch } = conditions;
  if ((ifMatch && !strongMatch(ifMatch, tag)) || (ifNoneMatch && weakMatch(ifNoneMatch, tag))) throw preconditionFailed(conditions.entityType);
  if (Array.isArray(ifMatch) || Array.isArray(ifNoneMatch)) conditions.pinned = { id: row.id, updatedAt: row.updatedAt };
};

/** Preconditions no read compared, which a write must not pass: anything but `If-Match: *`, which any row meets. */
const leftUnchecked = ({ evaluated, ifMatch, ifNoneMatch }: WritePreconditions) =>
  !evaluated && (Array.isArray(ifMatch) || ifNoneMatch !== undefined);

/**
 * The WHERE condition of a single-entity write to `table`: the row the preconditions were compared with still holds
 * that version, to the millisecond the tag was computed from, and any other row of the table is left to the rest of
 * the condition. Preconditions no read compared match no row, so the write answers 412 (`assertNoWriteBetween`).
 * Undefined without preconditions or for another entity's table, which `and()` drops.
 */
export const preconditionWhere = (ctx: PreconditionContext, table: { id: PgColumn; updatedAt: PgColumn }): SQL | undefined => {
  const conditions = ctx.var.preconditions;
  if (!conditions || getEntityTable(conditions.entityType) !== table) return undefined;
  const { pinned } = conditions;
  if (pinned) {
    return sql`(${table.id} <> ${pinned.id} OR date_trunc('milliseconds', ${table.updatedAt}) IS NOT DISTINCT FROM ${pinned.updatedAt}::timestamptz)`;
  }
  return leftUnchecked(conditions) ? sql`false` : undefined;
};

/**
 * For a single-entity write of row `id` that matched no row: with a pinned version (`preconditionWhere`) a write
 * landed between the check and this one, and preconditions no read compared refuse the write. Otherwise it leaves the
 * outcome to the caller.
 * @throws AppError 412 `precondition_failed`.
 */
export const assertNoWriteBetween = (ctx: PreconditionContext, entityType: SingleEntityType, id: string) => {
  const conditions = ctx.var.preconditions;
  if (!conditions || conditions.entityType !== entityType) return;
  const target = conditions.pinned?.id ?? conditions.id.toLowerCase();
  if (target === id.toLowerCase() && (conditions.pinned || leftUnchecked(conditions))) throw preconditionFailed(entityType);
};

const entityTypeOfIdParam = new Map<string, SingleEntityType>(
  Object.entries(appConfig.entityIdColumnKeys).flatMap(([type, key]) =>
    hierarchy.isChannel(type) || hierarchy.isProduct(type) ? [[key, type] as const] : [],
  ),
);

/**
 * The channel or product a route acts on as one resource: its path ends in that entity's id param (`/{attachmentId}`),
 * or in a `post` custom method on it. A safe custom method returns something other than the entity, so it takes none.
 */
export const preconditionTarget = ({ method, path }: { method: string; path: string }): PreconditionTarget | undefined => {
  const match = /\/\{(\w+)\}(\/~[a-z][a-z0-9-]*)?$/.exec(path);
  const entityType = match && entityTypeOfIdParam.get(match[1]);
  if (!match || !entityType || (match[2] && method === 'get')) return undefined;
  return { entityType, param: match[1], write: method !== 'get', representation: !match[2] && (method === 'get' || method === 'patch') };
};

const etagDescription =
  "The entity tag of this version: send it in `If-Match` to write only while nothing changed, or in `If-None-Match` to skip an unchanged read. It versions the resource's own fields, not its `included` data or counts.";

const etagHeader = { ETag: { description: etagDescription, schema: { type: 'string' as const } } };

type ParameterDoc = NonNullable<RouteConfig['parameters']>[number];

const tagListSchema = { type: 'string' as const, maxLength: maxLength.field };

/** The conditional request headers a route documents: `If-None-Match` and `If-Match` on a read, `If-Match` on a write. */
export const preconditionHeaders = ({ write }: PreconditionTarget): ParameterDoc[] => [
  ...(write
    ? []
    : [
        {
          name: 'If-None-Match',
          in: 'header' as const,
          description: 'Entity tags from `ETag`: while the resource still has one, the answer is 304 without a body.',
          schema: tagListSchema,
        },
      ]),
  {
    name: 'If-Match',
    in: 'header',
    description: write
      ? 'Entity tags from `ETag`, or `*`: the write applies only while the resource still has one, else the answer is 412.'
      : 'Entity tags from `ETag`, or `*`: unless the resource still has one, the answer is 412.',
    schema: tagListSchema,
  },
];

type ResponseDoc = RouteConfig['responses'][string];

/** The 200 of a representation route with the `ETag` header, and on a read the 304 beside it. */
export const preconditionResponses = (target: PreconditionTarget, ok: ResponseDoc | undefined) => {
  if (!target.representation || !ok || '$ref' in ok) return {};
  const headers =
    ok.headers instanceof z.ZodObject
      ? ok.headers.extend({ ETag: z.string().openapi({ description: etagDescription }) })
      : { ...ok.headers, ...etagHeader };
  return {
    200: { ...ok, headers },
    ...(!target.write && {
      304: { description: 'Not modified\n\nThe resource still has an entity tag `If-None-Match` lists.', headers: etagHeader },
    }),
  };
};

/** A route that cannot keep the precondition contract is an authoring mistake: a test answers 500 naming it, any other mode logs it. */
const authoringMistake = (problem: string) => {
  if (appConfig.mode === 'test') throw new Error(problem);
  log.error(problem);
};

const invalidHeader = (name: string, message: string) => new AppError(400, 'invalid_request', 'warn', { meta: { header: name }, message });

const readTagList = (ctx: Parameters<MiddlewareHandler<Env>>[0], name: string) => {
  const value = ctx.req.header(name);
  if (value === undefined) return undefined;
  const list = parseTagList(value);
  if (!list) throw invalidHeader(name, `${name} takes * or quoted entity tags, at most ${maxLength.field} characters.`);
  return list;
};

/** The `id` and `updatedAt` of a response body that is an entity of `entityType`. */
const versionOf = (body: unknown, entityType: string) => {
  if (typeof body !== 'object' || body === null || !('entityType' in body) || !('id' in body) || !('updatedAt' in body)) return undefined;
  const { id, updatedAt } = body;
  if (body.entityType !== entityType || typeof id !== 'string' || (typeof updatedAt !== 'string' && updatedAt !== null)) return undefined;
  return { id, updatedAt };
};

/** Validators by date are not offered, and a route that sends entity tags refuses them (AEP-154). */
const unsupportedHeaders = ['If-Modified-Since', 'If-Unmodified-Since'];

/**
 * Conditional requests (RFC 9110 section 13) on one channel or product. A read answers 412 or 304 from the entity tag
 * of the entity it returns; a write leaves its preconditions for the read that authorizes it (`checkPreconditions`).
 * A 200 that is the entity carries its `ETag`, and `no-store`: its body holds counts and membership the tag does not
 * version, so a browser cache revalidating it would serve them stale, across sign-ins too. `no-transform` keeps the
 * compression middleware off it, which would weaken the tag to `W/` and so fail every `If-Match` it is sent back in.
 */
export const preconditionsMiddleware =
  ({ entityType, param, write, representation }: PreconditionTarget): MiddlewareHandler<Env> =>
  async (ctx, next) => {
    for (const name of unsupportedHeaders) {
      if (ctx.req.header(name) !== undefined) throw invalidHeader(name, `${name} is not supported: send If-Match or If-None-Match.`);
    }
    const ifMatch = readTagList(ctx, 'If-Match');
    const ifNoneMatch = readTagList(ctx, 'If-None-Match');
    const conditions: WritePreconditions | undefined =
      write && (ifMatch || ifNoneMatch) ? { entityType, id: ctx.req.param(param) ?? '', ifMatch, ifNoneMatch, evaluated: false } : undefined;
    if (conditions) ctx.set('preconditions', conditions);

    await next();

    const route = ctx.var.operationId ?? ctx.req.path;
    if (conditions && !conditions.evaluated && ctx.res.ok) {
      authoringMistake(`${route} wrote without checking its preconditions: read its ${entityType} through getValidProduct or getValidChannel.`);
    }
    if (!representation || ctx.res.status !== 200) return;

    const version = versionOf(
      await ctx.res
        .clone()
        .json()
        .catch(() => null),
      entityType,
    );
    if (!version) {
      if (checksAuthoringRules) authoringMistake(`${route} answers 200 with no ${entityType}: its entity tag needs entityType, id and updatedAt.`);
      return;
    }
    const tag = entityTag(entityType, version.id, version.updatedAt);
    if (!write && ifMatch && !strongMatch(ifMatch, tag)) throw preconditionFailed(entityType);
    const headers = { ETag: tag, 'Cache-Control': 'no-store, no-transform' };
    if (!write && ifNoneMatch && weakMatch(ifNoneMatch, tag)) ctx.res = new Response(null, { status: 304, headers });
    else for (const [name, value] of Object.entries(headers)) ctx.header(name, value);
  };
