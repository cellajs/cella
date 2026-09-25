import { eq } from 'drizzle-orm';
import { generateId } from 'shared/utils/entity-id';
import { nanoid } from 'shared/utils/nanoid';
import { expect, vi } from 'vitest';
import { baseDb as db } from '#/db/db';
import { authCookieName } from '#/modules/auth/general/helpers/cookie';
import { type SessionTypes, sessionsTable } from '#/modules/auth/sessions-db';
import type { AppStreamSubscriber } from '#/modules/entities/helpers/dispatch-to-stream';
import { streamSubscriberManager } from '#/modules/entities/stream';
import { hashToken } from '#/utils/hash-token';
import { defaultHeaders } from '../fixtures';
import { authCookie } from '../helpers';

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

/** A live session row and the signed cookie that presents it; `ageMs` backdates its creation. */
export async function insertSession(
  user: { id: string },
  { type = 'regular', ageMs = 0 }: { type?: SessionTypes; ageMs?: number } = {},
): Promise<TestSession> {
  const secret = hashToken(nanoid(40));
  const id = generateId();
  await db.insert(sessionsTable).values({
    id,
    secret,
    userId: user.id,
    type,
    authStrategy: 'passkey',
    createdAt: new Date(Date.now() - ageMs).toISOString(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });
  return asSession(id, authCookie('session', `${secret}.${id}.`, 7 * 24 * 60 * 60));
}

/** The session a response set: the last non-empty session cookie among its Set-Cookie lines. */
export function sessionSetBy(response: Response): TestSession {
  const name = `${authCookieName('session')}=`;
  const pair = response.headers
    .getSetCookie()
    .map((line) => line.split(';')[0])
    .filter((value) => value.startsWith(name) && value.length > name.length)
    .at(-1);
  if (!pair) throw new Error('The response set no session cookie');
  // The sealed value starts with `<secret>.<sessionId>`.
  return asSession(decodeURIComponent(pair.slice(name.length)).split('.')[1], pair);
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
