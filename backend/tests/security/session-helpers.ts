import { eq } from 'drizzle-orm';
import { expect, vi } from 'vitest';
import { baseDb as db } from '#/db/db';
import { authCookieName, type CookieName } from '#/modules/auth/general/helpers/cookie';
import { type SessionTypes, sessionsTable } from '#/modules/auth/sessions-db';
import type { AppStreamSubscriber } from '#/modules/entities/helpers/dispatch-to-stream';
import { streamSubscriberManager } from '#/modules/entities/stream';
import { hashToken } from '#/utils/hash-token';
import { defaultHeaders } from '../fixtures';
import { insertTestSession } from '../helpers';

export interface TestSession {
  id: string;
  cookie: string;
  headers: Record<string, string>;
}

export const asSession = (id: string, cookie: string): TestSession => ({
  id,
  cookie,
  headers: { ...defaultHeaders, Cookie: cookie },
});

/** A live session row and the signed cookie that presents it; the options are `insertTestSession`'s. */
export async function insertSession(
  user: { id: string },
  opts: { type?: SessionTypes; ageMs?: number; expiresInMs?: number } = {},
): Promise<TestSession> {
  const { id, cookie } = await insertTestSession(user, opts);
  return asSession(id, cookie);
}

/** The session behind a cookie's token: a row stores the token's hash only. */
const sessionIdFor = async (token: string) => {
  const [row] = await db
    .select({ id: sessionsTable.id })
    .from(sessionsTable)
    .where(eq(sessionsTable.secret, hashToken(token)));
  if (!row) throw new Error('No session stores this token');
  return row.id;
};

/** The token inside a signed cookie pair: the sealed value is `<token>.<expiresAt>.<mac>`. */
const tokenOf = (pair: string) => decodeURIComponent(pair.slice(pair.indexOf('=') + 1)).split('.')[0];

/** The last non-empty `name` cookie a response set, as a `Cookie` pair. */
const setCookiePair = (response: Response, name: CookieName) => {
  const prefix = `${authCookieName(name)}=`;
  const pair = response.headers
    .getSetCookie()
    .map((line) => line.split(';')[0])
    .filter((value) => value.startsWith(prefix) && value.length > prefix.length)
    .at(-1);
  if (!pair) throw new Error(`The response set no ${name} cookie`);
  return pair;
};

/** The session a response set, as the browser then presents it. */
export async function sessionSetBy(response: Response): Promise<TestSession> {
  const pair = setCookiePair(response, 'session');
  return asSession(await sessionIdFor(tokenOf(pair)), pair);
}

/** The impersonation a response set, presented as the browser does: on top of the admin session it holds. */
export async function impersonationSetBy(response: Response, admin: TestSession): Promise<TestSession> {
  const pair = setCookiePair(response, 'impersonation');
  return asSession(await sessionIdFor(tokenOf(pair)), `${admin.cookie}; ${pair}`);
}

/**
 * The `Cookie` header a browser sends after a response: its Set-Cookie lines replace pairs of the same name, and an
 * emptied value removes the pair.
 */
export function cookiesAfter(cookieHeader: string, response: Response): string {
  const jar = new Map(
    cookieHeader
      .split('; ')
      .filter(Boolean)
      .map((pair) => [pair.slice(0, pair.indexOf('=')), pair] as const),
  );
  for (const line of response.headers.getSetCookie()) {
    const pair = line.split(';')[0];
    const name = pair.slice(0, pair.indexOf('='));
    if (pair.length > name.length + 1) jar.set(name, pair);
    else jar.delete(name);
  }
  return [...jar.values()].join('; ');
}

export const sessionRow = async (id: string) =>
  (await db.select().from(sessionsTable).where(eq(sessionsTable.id, id)).limit(1))[0];

export interface OpenStream {
  sessionId: string;
  /** The server-sent events so far, in arrival order; comment lines (pings) are left out. */
  events: { event: string; data: string }[];
  /** True once the server ended the response. */
  ended: () => boolean;
  cancel: () => Promise<void>;
}

const openStreams: OpenStream[] = [];

const subscribersOf = (userId: string) => streamSubscriberManager.getByChannel<AppStreamSubscriber>(`user:${userId}`);

/** Opens the app stream with a session, as the browser's EventSource does, and waits until the server registered it. */
export async function openStream(userId: string, session: TestSession): Promise<OpenStream> {
  const { baseApp } = await import('#/routes');
  const response = await baseApp.request('http://localhost/entities/app/stream', { headers: session.headers });
  expect(response.status).toBe(200);

  const reader = (response.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  const events: OpenStream['events'] = [];
  let buffer = '';
  let ended = false;

  void (async () => {
    for (;;) {
      const { done, value } = await reader.read().catch(() => ({ done: true, value: undefined }));
      if (done || !value) break;
      buffer += decoder.decode(value, { stream: true });
      for (let end = buffer.indexOf('\n\n'); end >= 0; end = buffer.indexOf('\n\n')) {
        const lines = buffer.slice(0, end).split('\n');
        buffer = buffer.slice(end + 2);
        const event = lines.find((line) => line.startsWith('event: '))?.slice('event: '.length);
        const data = lines.find((line) => line.startsWith('data: '))?.slice('data: '.length) ?? '';
        if (event) events.push({ event, data });
      }
    }
    ended = true;
  })();

  const stream = { sessionId: session.id, events, ended: () => ended, cancel: () => reader.cancel().catch(() => {}) };
  openStreams.push(stream);

  await vi.waitFor(() => expect(subscribersOf(userId).some((s) => s.sessionId === session.id)).toBe(true));
  return stream;
}

/** Ends every stream a test opened, from the client side; call in `afterEach`. */
export const cancelOpenStreams = () => Promise.all(openStreams.splice(0).map((stream) => stream.cancel()));

/** The stream received exactly one error event with this code, and the server ended the response. */
export async function expectClosedWith(stream: OpenStream, code: string) {
  await vi.waitFor(() => expect(stream.ended()).toBe(true), { timeout: 2000 });
  const errors = stream.events.filter((e) => e.event === 'error');
  expect(errors.map((e) => JSON.parse(e.data).code)).toEqual([code]);
}

/** The server still streams to this session: no error event, and its subscriber is still registered. */
export function expectStillOpen(userId: string, stream: OpenStream) {
  expect(stream.events.filter((e) => e.event === 'error')).toEqual([]);
  expect(subscribersOf(userId).some((s) => s.sessionId === stream.sessionId)).toBe(true);
}
