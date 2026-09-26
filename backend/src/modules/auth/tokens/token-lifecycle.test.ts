import { eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { TokenType } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import { nanoid } from 'shared/utils/nanoid';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb as db } from '#/db/db';
import { authCookieName } from '#/modules/auth/general/helpers/cookie';
import {
  invokeToken,
  issueToken,
  issueTokens,
  readBoundToken,
  spendCookieToken,
} from '#/modules/auth/tokens/token-lifecycle';
import { isTokenType, type LinkTokenType, tokenPolicies } from '#/modules/auth/tokens/token-policies';
import { tokensTable } from '#/modules/auth/tokens-db';
import { hashToken } from '#/utils/hash-token';
import { authCookie, createTestUser } from '../../../../tests/helpers';
import { clearDatabase } from '../../../../tests/test-utils';

const ctx = { var: { db } };

const isLinkType = (name: string): name is LinkTokenType => isTokenType(name) && tokenPolicies[name].carrier === 'link';

/**
 * One route per lifecycle step, so each call runs with a real request's cookies; a refusal answers its status, type and
 * the token id it names.
 */
const app = new Hono<Env>()
  .get('/invoke/:type/:token', async (ctx) => {
    const type = ctx.req.param('type');
    if (!isLinkType(type)) return ctx.body(null, 404);
    return ctx.json(await invokeToken(ctx, { type, rawToken: ctx.req.param('token') }));
  })
  .get('/read/:type', async (ctx) => {
    const type = ctx.req.param('type');
    if (!isTokenType(type)) return ctx.body(null, 404);
    return ctx.json(await readBoundToken(ctx, type));
  })
  .post('/spend/:type', async (ctx) => {
    const type = ctx.req.param('type');
    if (!isTokenType(type)) return ctx.body(null, 404);
    return ctx.json({ spent: await spendCookieToken(ctx, type) });
  })
  .onError((err, ctx) => {
    if (!(err instanceof AppError)) throw err;
    return ctx.json({ type: err.type, tokenId: err.meta?.tokenId }, err.status as ContentfulStatusCode);
  });

const request = (path: string, cookies: string[] = [], method = 'GET') =>
  app.request(path, { method, headers: cookies.length ? { Cookie: cookies.join('; ') } : {} });

/** The `name=value` pair a response set for a token type's cookie, to send back as that browser would. */
const cookieSet = (response: Response, type: TokenType) =>
  response.headers
    .getSetCookie()
    .find((line) => line.startsWith(`${authCookieName(type)}=`))
    ?.split(';')[0];

/** Whether the response removes a token type's cookie. */
const cookieCleared = (response: Response, type: TokenType) =>
  response.headers
    .getSetCookie()
    .some((line) => line.startsWith(`${authCookieName(type)}=;`) && /Max-Age=0/i.test(line));

const rowOf = async (id: string) => (await db.select().from(tokensTable).where(eq(tokensTable.id, id)))[0];

const minutesUntil = (iso: string) => (new Date(iso).getTime() - Date.now()) / 60_000;

const expire = (id: string) =>
  db
    .update(tokensTable)
    .set({ expiresAt: new Date(Date.now() - 1000).toISOString() })
    .where(eq(tokensTable.id, id));

const address = () => `${nanoid(8)}@token-lifecycle.test`.toLowerCase();

afterEach(async () => await clearDatabase());

describe('issueToken', () => {
  it("stores only the raw value's hash, expiring after its type's lifetime", async () => {
    const { token, rawToken } = await issueToken(ctx, { type: 'magic', email: address() });

    const row = await rowOf(token.id);
    expect(row.secret).toBe(hashToken(rawToken));
    expect(row.singleUseToken).toBeNull();
    expect(token).not.toHaveProperty('secret');
    expect(token).not.toHaveProperty('singleUseToken');
    expect(minutesUntil(row.expiresAt)).toBeGreaterThan(14);
    expect(minutesUntil(row.expiresAt)).toBeLessThanOrEqual(15);
  });

  it('replaces the earlier magic links of the same address, with or without an account', async () => {
    const email = address();
    const first = await issueToken(ctx, { type: 'magic', email });
    const second = await issueToken(ctx, { type: 'magic', email });

    expect(await rowOf(first.token.id)).toBeUndefined();
    expect(await rowOf(second.token.id)).toBeDefined();

    // An account's link for another of its addresses replaces its earlier link too.
    const user = await createTestUser(address());
    const primary = await issueToken(ctx, { type: 'magic', email: user.email, userId: user.id });
    const secondary = await issueToken(ctx, { type: 'magic', email: address(), userId: user.id });
    expect(await rowOf(primary.token.id)).toBeUndefined();
    expect(await rowOf(secondary.token.id)).toBeDefined();
    expect(await rowOf(second.token.id)).toBeDefined();
  });

  it('replaces the earlier links of a membership invitation, and of an address for a system invitation', async () => {
    const email = address();
    const [invitationId, otherInvitationId] = [generateId(), generateId()];

    const first = await issueToken(ctx, { type: 'invitation', email, inactiveMembershipId: invitationId });
    const other = await issueToken(ctx, { type: 'invitation', email, inactiveMembershipId: otherInvitationId });
    const [rotated, system] = await issueTokens(ctx, [
      { type: 'invitation', email, inactiveMembershipId: invitationId },
      { type: 'invitation', email },
    ]);

    expect(await rowOf(first.token.id)).toBeUndefined();
    expect(await rowOf(rotated.token.id)).toBeDefined();
    expect(await rowOf(other.token.id)).toBeDefined();

    const reissued = await issueToken(ctx, { type: 'invitation', email });
    expect(await rowOf(system.token.id)).toBeUndefined();
    expect(await rowOf(reissued.token.id)).toBeDefined();
    expect(await rowOf(rotated.token.id)).toBeDefined();
  });

  it('keeps every open second-factor challenge', async () => {
    const user = await createTestUser(address());
    const first = await issueToken(ctx, { type: 'confirm-mfa', email: user.email, userId: user.id });
    const second = await issueToken(ctx, { type: 'confirm-mfa', email: user.email, userId: user.id });

    expect(await rowOf(first.token.id)).toBeDefined();
    expect(await rowOf(second.token.id)).toBeDefined();
  });
});

/**
 * Runs `redeem` while another connection holds the token's row locked, and lets go once two updates of the tokens table
 * wait on that lock: both redemptions have read the row unopened by then, so only the update itself decides.
 */
const racingOnRow = async <T>(tokenId: string, redeem: () => Promise<T>): Promise<T> => {
  let release = () => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  let rowLocked = () => {};
  const locked = new Promise<void>((resolve) => {
    rowLocked = resolve;
  });
  const holder = db.transaction(async (tx) => {
    await tx.select({ id: tokensTable.id }).from(tokensTable).where(eq(tokensTable.id, tokenId)).for('update');
    rowLocked();
    await released;
  });
  await locked;

  const redeeming = redeem();
  await vi.waitFor(async () => {
    const { rows } = await db.execute<{ waiting: number }>(
      sql`select count(*)::int as waiting from pg_stat_activity where wait_event_type = 'Lock' and query ilike 'update "tokens"%'`,
    );
    expect(rows[0].waiting).toBe(2);
  });
  release();
  await holder;
  return redeeming;
};

describe('invokeToken', () => {
  it('binds a link to the one browser that redeems it first', async () => {
    const { token, rawToken } = await issueToken(ctx, { type: 'invitation', email: address() });

    // Two redemptions at the same moment: the compare-and-set alone decides which browser the link binds.
    const [first, second] = await racingOnRow(token.id, () =>
      Promise.all([request(`/invoke/invitation/${rawToken}`), request(`/invoke/invitation/${rawToken}`)]),
    );
    const [winner, loser] = first.status === 200 ? [first, second] : [second, first];
    expect(winner.status).toBe(200);
    expect(loser.status).toBe(401);
    expect(await loser.json()).toEqual({ type: 'invitation_expired', tokenId: token.id });
    expect(cookieSet(loser, 'invitation')).toBeUndefined();

    const opened = await rowOf(token.id);
    expect(opened.invokedAt).not.toBeNull();
    expect(minutesUntil(opened.expiresAt)).toBeGreaterThan(29);
    expect(minutesUntil(opened.expiresAt)).toBeLessThanOrEqual(30);

    // Re-opened only with its own single-use cookie, never with a cookie from another link of the type.
    const winnerCookie = cookieSet(winner, 'invitation');
    expect(winnerCookie).toBeDefined();
    expect((await request(`/invoke/invitation/${rawToken}`, [winnerCookie!])).status).toBe(200);

    const otherLink = await issueToken(ctx, { type: 'invitation', email: address() });
    const otherCookie = cookieSet(await request(`/invoke/invitation/${otherLink.rawToken}`), 'invitation');
    const replay = await request(`/invoke/invitation/${rawToken}`, [otherCookie!]);
    expect(replay.status).toBe(401);
    expect(await replay.json()).toEqual({ type: 'invitation_expired', tokenId: token.id });
  });

  it('refuses an unknown or expired link', async () => {
    const unknown = await request(`/invoke/magic/${nanoid(40)}`);
    expect(unknown.status).toBe(401);
    expect(await unknown.json()).toEqual({ type: 'magic_not_found' });

    const { token, rawToken } = await issueToken(ctx, { type: 'magic', email: address() });
    await expire(token.id);
    const expired = await request(`/invoke/magic/${rawToken}`);
    expect(expired.status).toBe(401);
    expect(await expired.json()).toEqual({ type: 'magic_expired', tokenId: token.id });
    expect((await rowOf(token.id)).invokedAt).toBeNull();
  });
});

describe('readBoundToken', () => {
  it('reads the redeemed link its cookie binds, and spends nothing', async () => {
    const { token, rawToken } = await issueToken(ctx, { type: 'invitation', email: address() });
    const cookie = cookieSet(await request(`/invoke/invitation/${rawToken}`), 'invitation');

    const response = await request('/read/invitation', [cookie!]);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: token.id });
    expect(await rowOf(token.id)).toBeDefined();
  });

  it('refuses a link token by what is missing', async () => {
    const noCookie = await request('/read/invitation');
    expect(noCookie.status).toBe(400);
    expect(await noCookie.json()).toEqual({ type: 'invalid_token' });

    const unknown = await request('/read/invitation', [authCookie('invitation', nanoid(40))]);
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ type: 'invitation_not_found' });
  });

  it('refuses a missing, unknown or expired second-factor challenge', async () => {
    const noCookie = await request('/read/confirm-mfa');
    expect(noCookie.status).toBe(401);
    expect(await noCookie.json()).toEqual({ type: 'confirm-mfa_not_found' });

    const unknown = await request('/read/confirm-mfa', [authCookie('confirm-mfa', nanoid(40))]);
    expect(unknown.status).toBe(401);
    expect(await unknown.json()).toEqual({ type: 'confirm-mfa_not_found' });

    const user = await createTestUser(address());
    const { token, rawToken } = await issueToken(ctx, { type: 'confirm-mfa', email: user.email, userId: user.id });
    await expire(token.id);
    const expired = await request('/read/confirm-mfa', [authCookie('confirm-mfa', rawToken)]);
    expect(expired.status).toBe(401);
    expect(await expired.json()).toEqual({ type: 'confirm-mfa_expired', tokenId: token.id });
  });
});

describe('spendCookieToken', () => {
  it('spends a challenge once: of two concurrent spends exactly one gets it', async () => {
    const user = await createTestUser(address());
    const { token, rawToken } = await issueToken(ctx, { type: 'confirm-mfa', email: user.email, userId: user.id });
    const cookie = authCookie('confirm-mfa', rawToken);

    const responses = await Promise.all([
      request('/spend/confirm-mfa', [cookie], 'POST'),
      request('/spend/confirm-mfa', [cookie], 'POST'),
    ]);
    const spent = await Promise.all(responses.map(async (response) => (await response.json()).spent));

    expect(spent.filter(Boolean)).toEqual([expect.objectContaining({ id: token.id, userId: user.id })]);
    expect(spent.filter((row) => row === null)).toHaveLength(1);
    for (const response of responses) expect(cookieCleared(response, 'confirm-mfa')).toBe(true);
    expect(await rowOf(token.id)).toBeUndefined();
  });

  it('spends only the token its cookie names', async () => {
    const user = await createTestUser(address());
    const mine = await issueToken(ctx, { type: 'confirm-mfa', email: user.email, userId: user.id });
    const other = await issueToken(ctx, { type: 'confirm-mfa', email: user.email, userId: user.id });

    await request('/spend/confirm-mfa', [authCookie('confirm-mfa', mine.rawToken)], 'POST');

    expect(await rowOf(mine.token.id)).toBeUndefined();
    expect(await rowOf(other.token.id)).toBeDefined();
  });

  it('spends a redeemed link through its single-use cookie, never through its raw value', async () => {
    const { token, rawToken } = await issueToken(ctx, { type: 'invitation', email: address() });

    const byRawValue = await request('/spend/invitation', [authCookie('invitation', rawToken)], 'POST');
    expect((await byRawValue.json()).spent).toBeNull();
    expect(await rowOf(token.id)).toBeDefined();

    const cookie = cookieSet(await request(`/invoke/invitation/${rawToken}`), 'invitation');
    const bySingleUse = await request('/spend/invitation', [cookie!], 'POST');
    expect((await bySingleUse.json()).spent).toMatchObject({ id: token.id });
    expect(await rowOf(token.id)).toBeUndefined();
  });

  it('grants nothing for an expired challenge, and removes it', async () => {
    const user = await createTestUser(address());
    const { token, rawToken } = await issueToken(ctx, { type: 'confirm-mfa', email: user.email, userId: user.id });
    await expire(token.id);

    const response = await request('/spend/confirm-mfa', [authCookie('confirm-mfa', rawToken)], 'POST');
    expect((await response.json()).spent).toBeNull();
    expect(await rowOf(token.id)).toBeUndefined();
  });
});
