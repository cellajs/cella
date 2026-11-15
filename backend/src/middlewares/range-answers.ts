import { createHash, randomBytes } from 'node:crypto';
import type { Context } from 'hono';
import type { Access, ProductEntityType } from 'shared';
import type { ActorBinding, Env } from '#/core/context';
import { xMiddleware } from '#/core/x-middleware';
import { tenantWriteCount } from '#/db/tenant-context';
import { TTLCache } from '#/lib/ttl-cache';
import { accessFrom } from '#/permissions/access';
import { resolveCollectionReadFilter } from '#/permissions/collection-scope';

/** The request header a range fetch carries the key of its change frame in. */
export const rangeKeyHeader = 'x-range-key';

/** The header as a route with `sharedRangeAnswers` documents it, in its `parameters`. */
export const rangeKeyParameter = {
  name: rangeKeyHeader,
  in: 'header' as const,
  description:
    'The `rangeKey` of the change frame that caused a range read (`afterSeq`, `untilSeq`): the read may then take the answer just given to a reader of the same rows.',
  schema: { type: 'string' as const, maxLength: 64 },
};

/** How long a range key answers: as long as the session cache serves a session that ended in another process. */
const rangeKeyLifetimeMs = 10_000;

/** How long the frames of one read class carry the same key: a key answers for at least the lifetime less this. */
const rangeKeyReuseMs = 5_000;

/** How long a range answer is kept: the readers of one change frame fetch within it, wherever they are. */
const rangeAnswerLifetimeMs = 2_000;

/** The longest answer kept, in characters: a longer one costs its memory for a burst that is rare. */
const maxRangeAnswerLength = 256 * 1024;

/** What a range key stands for: the readers of one product type in one organization who read the same rows. */
interface RangeKeyRecord {
  tenantId: string;
  organizationId: string;
  entityType: ProductEntityType;
  readClass: string;
  /** Subscribers the newest frame with this key went to; it bounds how often one kept answer is served. */
  audience: number;
}

interface KeptAnswer {
  body: string;
  /** `tenantWriteCount` when the read began: a later count means a write the answer may not hold. */
  writes: number;
  servesLeft: number;
}

const rangeKeys = new TTLCache<RangeKeyRecord>({ maxSize: 20_000, defaultTtl: rangeKeyLifetimeMs });
const currentKeys = new TTLCache<string>({ maxSize: 20_000, defaultTtl: rangeKeyReuseMs });
const keptAnswers = new TTLCache<KeptAnswer>({ maxSize: 5000, defaultTtl: rangeAnswerLifetimeMs });

/** A read of an answer that is being made, with `tenantWriteCount` from when it began. */
interface RunningRead {
  body: Promise<string | undefined>;
  writes: number;
}

/** The read of each answer that is being made, for the requests that arrive meanwhile. */
const readsInFlight = new Map<string, RunningRead>();

/** How many reads a request waits for in a row when a write crossed each, before it runs the route itself. */
const maxWaits = 3;

/** Read classes of session access, by its memberships array: a membership change replaces the array. */
const readClasses = new WeakMap<readonly ActorBinding[], Map<string, string | null>>();

/**
 * The read class of an access for one product type in one organization: equal for two accesses whose list reads take
 * the same read scope, and so return the same rows.
 * @returns null for an access that reads nothing there, or whose scope names the actor (`own`): its rows are its alone.
 */
export function readClassOf(access: Access<ActorBinding>, entityType: ProductEntityType, organizationId: string): string | null {
  if ('visitor' in access) return null;
  const classes = access.scopes === null ? (readClasses.get(access.memberships) ?? new Map<string, string | null>()) : null;
  const memoKey = `${access.isSystemAdmin}|${organizationId}|${entityType}`;
  const known = classes?.get(memoKey);
  if (known !== undefined) return known;

  const { orgWide, scopes } = resolveCollectionReadFilter(access, entityType, organizationId);
  const scopeTexts = scopes.map(({ channelType, channelIds, condition, deeperChannels }) =>
    [channelType, condition ?? '', deeperChannels?.join() ?? '', [...channelIds].sort().join()].join(':'),
  );
  const personal = scopes.some(({ condition }) => condition === 'own');
  const readClass = orgWide
    ? 'all'
    : scopes.length === 0 || personal
      ? null
      : createHash('sha256').update(scopeTexts.sort().join('|')).digest('base64url');

  if (classes) readClasses.set(access.memberships, classes.set(memoKey, readClass));
  return readClass;
}

/**
 * The key the change frames of one read class carry, made anew once `rangeKeyReuseMs` passed. A request that sends it
 * may take an answer kept for that class: whoever holds a key got it on a stream of a reader of the class.
 * @param audience - The subscribers this frame goes to.
 */
export function issueRangeKey(scope: Omit<RangeKeyRecord, 'audience'>, audience: number): string {
  const classKey = `${scope.organizationId}|${scope.entityType}|${scope.readClass}`;
  const current = currentKeys.get(classKey);
  const record = current ? rangeKeys.get(current) : undefined;
  if (current && record) {
    record.audience = audience;
    return current;
  }
  const key = randomBytes(24).toString('base64url');
  rangeKeys.set(key, { ...scope, audience });
  currentKeys.set(classKey, key);
  return key;
}

/** Forgets every key and kept answer, for a test that starts clean. */
export function clearRangeAnswers(): void {
  rangeKeys.clear();
  currentKeys.clear();
  keptAnswers.clear();
}

const kept = (ctx: Context<Env>, body: string) => ctx.body(body, 200, { 'Content-Type': 'application/json', 'X-Range-Answer': 'kept' });

/**
 * The body of the response the route just gave, when the key's readers may share it: a 200 to a requester who passed
 * the guards into the key's organization and whose own read class is the key's.
 */
async function shareableBody(ctx: Context<Env>, record: RangeKeyRecord): Promise<string | undefined> {
  if (ctx.error || ctx.res.status !== 200) return undefined;
  if (ctx.var.tenantId !== record.tenantId || ctx.var.organization?.id !== record.organizationId) return undefined;
  if (readClassOf(accessFrom(ctx), record.entityType, record.organizationId) !== record.readClass) return undefined;
  const body = await ctx.res.clone().text();
  return body.length <= maxRangeAnswerLength ? body : undefined;
}

/**
 * Lets the readers of one change frame share the answer to its range fetch. A product list route declares it in
 * `xCache`, ahead of its guards, when a range read's answer depends on the reader's read scope and the URL alone.
 *
 * A request with a live key and a range (`afterSeq`, `untilSeq`) takes the answer kept for its key and URL. Without
 * one it runs the route as any request does, guards and limiters included, and its answer is kept for
 * `rangeAnswerLifetimeMs` when the requester's read class is the key's. Requests that arrive while that read runs
 * wait for it. An answer is never served across a write the tenant committed in this process since its read began:
 * the writer's next read returns its own write, and the requests that waited share the next read. A kept answer
 * serves a bounded number of requests, and the next one runs the route.
 */
export const sharedRangeAnswers = (entityType: ProductEntityType) =>
  xMiddleware(
    {
      functionName: 'sharedRangeAnswers',
      type: 'x-cache',
      name: 'Shared range answers',
      description: `The readers of one change frame share the answer to its range fetch for ${rangeAnswerLifetimeMs / 1000} seconds. A request that sends the frame key in \`x-range-key\` may get that answer without passing the guards: the key came over the stream of a reader with the same read scope and lasts ${rangeKeyLifetimeMs / 1000} seconds.`,
    },
    async (ctx, next) => {
      const key = ctx.req.header(rangeKeyHeader);
      const record = key ? rangeKeys.get(key) : undefined;
      const { afterSeq, untilSeq } = ctx.req.query();
      if (!key || record?.entityType !== entityType || !afterSeq || !untilSeq) return next();

      const answerKey = `${key}|${ctx.req.path}${new URL(ctx.req.url).search}`;
      for (let waits = 0; ; waits++) {
        const answer = keptAnswers.get(answerKey);
        if (answer && answer.writes === tenantWriteCount(record.tenantId) && answer.servesLeft > 0) {
          answer.servesLeft--;
          return kept(ctx, answer.body);
        }

        const running = readsInFlight.get(answerKey);
        if (!running) break;
        if (waits === maxWaits) return next();
        const body = await running.body;
        if (body === undefined) return next();
        // A write that committed since the read began may be the requester's own, which that read missed.
        if (tenantWriteCount(record.tenantId) === running.writes) return kept(ctx, body);
      }

      const writes = tenantWriteCount(record.tenantId);
      const read = next().then(
        () => shareableBody(ctx, record),
        () => undefined,
      );
      readsInFlight.set(answerKey, { body: read, writes });
      const body = await read.finally(() => readsInFlight.delete(answerKey));
      if (body !== undefined && tenantWriteCount(record.tenantId) === writes) {
        keptAnswers.set(answerKey, { body, writes, servesLeft: record.audience * 2 + 10 });
      }
    },
  );
