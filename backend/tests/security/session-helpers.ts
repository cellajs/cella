import { eq } from 'drizzle-orm';
import { getMe, invokeToken, sendStepUpLink } from 'sdk';
import { expect, vi } from 'vitest';
import { baseDb as db } from '#/db/db';
import { authCookieName } from '#/modules/auth/general/helpers/cookie';
import { type SessionTypes, type StepUpProof, sessionsTable } from '#/modules/auth/sessions-db';
import { stampStepUp } from '#/modules/auth/step-up/helpers/step-up';
import type { AppStreamSubscriber } from '#/modules/entities/helpers/dispatch-to-stream';
import { streamSubscriberManager } from '#/modules/entities/stream';
import { hashToken } from '#/utils/hash-token';
import { defaultHeaders } from '../fixtures';
import { cookiesAfter, expectRefusal, insertTestSession, mailedLink, setCookiePair } from '../helpers';
import { createAppClient } from '../test-client';

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

/** A session signed in an hour ago, past the step-up window: its sign-in no longer proves the user present. */
export const insertStaleSession = (user: { id: string }) => insertSession(user, { ageMs: 60 * 60 * 1000 });

/** A stale session that then stepped up with `via`: only its stamp proves presence. */
export async function insertSteppedUpSession(user: { id: string }, via: StepUpProof = 'totp'): Promise<TestSession> {
  const session = await insertStaleSession(user);
  await stampStepUp(session.id, user.id, via);
  return session;
}

/** Asks for the emailed step-up link from a session's browser; returns that browser's cookies after and the raw token. */
export async function askStepUpLink(session: TestSession, redirect?: string) {
  const call = await createAppClient();
  const asked = await call(sendStepUpLink, { body: redirect ? { redirect } : {}, headers: session.headers });
  expect(asked.response.status).toBe(204);
  return { browser: cookiesAfter(session.cookie, asked.response), rawToken: mailedLink('stepUpUrl').token };
}

/** A click on the mailed step-up link: the mail app starts the navigation, so the Strict session cookie stays home. */
export async function openStepUpLink(rawToken: string, browser: string) {
  const call = await createAppClient();
  const marker = browser.split('; ').filter((pair) => pair.startsWith(`${authCookieName('step-up-requested')}=`));
  return call(invokeToken, {
    path: { type: 'step-up', token: rawToken },
    headers: { ...defaultHeaders, Cookie: marker.join('; ') },
  });
}

/** A step-up through the emailed link, opened in the browser that asked; returns that browser's session. */
export async function stepUpByEmail(session: TestSession) {
  const { browser, rawToken } = await askStepUpLink(session);
  expect((await openStepUpLink(rawToken, browser)).response.status).toBe(302);
  return asSession(session.id, browser);
}

/** GET /me from a browser holding `cookie`. */
const meWith = async (cookie: string) =>
  (await createAppClient())(getMe, { headers: { ...defaultHeaders, Cookie: cookie } });

/** Warms the auth cache for a session: the next request hits the cached entry, not the database. */
export const warmSession = async ({ cookie }: { cookie: string }) =>
  expect((await meWith(cookie)).response.status).toBe(200);

/** A browser holding `cookie` is refused as signed out, with this error type. */
export const expectSignedOut = async (cookie: string, type: string) => expectRefusal(await meWith(cookie), 401, type);

/** An impersonation of `target` layered on an admin's session, presented as the admin's browser does. */
export async function insertImpersonation(admin: TestSession, target: { id: string }): Promise<TestSession> {
  const { id, cookie } = await insertTestSession(target, { type: 'impersonation', impersonatorSessionId: admin.id });
  return asSession(id, `${admin.cookie}; ${cookie}`);
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

export interface UnreadStream {
  sessionId: string;
  /** Whether the server ended the response within `ms`: the one event it buffered comes out, then the end. */
  endsWithin: (ms: number) => Promise<boolean>;
}

/**
 * Opens the app stream as a client that stopped reading: the server's first event is buffered, and every later write
 * waits for a reader that never comes, as it does once a real client's socket buffers are full.
 */
export async function openUnreadStream(userId: string, session: TestSession): Promise<UnreadStream> {
  const { baseApp } = await import('#/routes');
  const response = await baseApp.request('http://localhost/entities/app/stream', { headers: session.headers });
  expect(response.status).toBe(200);
  const body = response.body as ReadableStream<Uint8Array>;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

  const cancel = () => (reader ? reader.cancel() : body.cancel()).catch(() => {});
  openStreams.push({ sessionId: session.id, events: [], ended: () => false, cancel });
  await vi.waitFor(() => expect(subscribersOf(userId).some((s) => s.sessionId === session.id)).toBe(true));

  const endsWithin = async (ms: number) => {
    reader ??= body.getReader();
    const draining = reader;
    const drained = (async () => {
      while (!(await draining.read()).done);
      return true;
    })();
    return Promise.race([drained, new Promise<boolean>((resolve) => setTimeout(() => resolve(false), ms))]);
  };
  return { sessionId: session.id, endsWithin };
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

/** The server let go of a stream its client stopped reading: unregistered, and the response ended. */
export async function expectReleased(userId: string, stream: UnreadStream) {
  await vi.waitFor(() => expect(subscribersOf(userId).some((s) => s.sessionId === stream.sessionId)).toBe(false));
  expect(await stream.endsWithin(3000)).toBe(true);
}
