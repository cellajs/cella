import { z } from '@hono/zod-openapi';

/** A Matrix account the app acts as. */
export interface MatrixBot {
  /** The homeserver's client-server base URL, without a path. */
  homeserverUrl: string;
  accessToken: string;
}

/** The outcome of one client-server call. */
export type MatrixResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      /** The HTTP status; null when no answer came. */
      status: number | null;
      /** The homeserver's `M_*` code, `http_<status>` for an answer without one, or `timeout`, `unreachable`, `bad_response`. */
      errcode: string;
      /** How long a 429 asks the sender to wait; absent when it names no wait. */
      retryAfterMs?: number;
    };

// One call's limit. A slow homeserver holds no one long: the sender tries again or gives the message to the mail.
const timeoutMs = 5000;

const errorSchema = z.object({ errcode: z.string(), retry_after_ms: z.number().optional() });
const whoamiSchema = z.object({ user_id: z.string() });
const joinedRoomsSchema = z.object({ joined_rooms: z.array(z.string()) });
const sentSchema = z.object({ event_id: z.string() });

/** The wait a 429 names: the `Retry-After` header in seconds, or the body's `retry_after_ms` of an older homeserver. */
const retryAfterMs = (res: Response, error: z.infer<typeof errorSchema> | undefined) => {
  const seconds = Number.parseInt(res.headers.get('retry-after') ?? '', 10);
  return seconds > 0 ? seconds * 1000 : error?.retry_after_ms;
};

/** One client-server call as the bot. Never throws and never retries: the caller decides what a failure means. */
async function call<T>(bot: MatrixBot, method: 'GET' | 'POST' | 'PUT', path: string, schema: z.ZodType<T>, body?: object): Promise<MatrixResult<T>> {
  let res: Response;
  try {
    res = await fetch(`${bot.homeserverUrl.replace(/\/+$/, '')}/_matrix/client/v3${path}`, {
      method,
      // The token travels in this header alone: a URL ends up in access logs.
      headers: { authorization: `Bearer ${bot.accessToken}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    return { ok: false, status: null, errcode: error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'unreachable' };
  }

  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const error = errorSchema.safeParse(json).data;
    const wait = res.status === 429 ? retryAfterMs(res, error) : undefined;
    return { ok: false, status: res.status, errcode: error?.errcode ?? `http_${res.status}`, retryAfterMs: wait };
  }
  const parsed = schema.safeParse(json);
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, status: res.status, errcode: 'bad_response' };
}

const roomPath = (roomId: string) => `/rooms/${encodeURIComponent(roomId)}`;

/** The account the token belongs to. */
export const whoami = (bot: MatrixBot) => call(bot, 'GET', '/account/whoami', whoamiSchema);

/** The ids of the rooms the bot is a member of. */
export const joinedRooms = (bot: MatrixBot) => call(bot, 'GET', '/joined_rooms', joinedRoomsSchema);

/** Joins a room the bot is invited to, or a public one. */
export const join = (bot: MatrixBot, roomId: string) => call(bot, 'POST', `${roomPath(roomId)}/join`, z.unknown(), {});

/** Whether encryption is on in a room the bot is a member of. */
export async function isEncrypted(bot: MatrixBot, roomId: string): Promise<MatrixResult<boolean>> {
  const state = await call(bot, 'GET', `${roomPath(roomId)}/state/m.room.encryption`, z.unknown());
  if (state.ok) return { ok: true, data: true };
  // A room without the state event never had encryption switched on.
  return state.status === 404 ? { ok: true, data: false } : state;
}

/**
 * Posts a message into a room.
 * @param txnId - Unique per message for this token. A repeat with the same id posts nothing new: the homeserver answers
 *   with the first event's id, so a retry never doubles a message.
 * @param content - The `m.room.message` content.
 */
export const send = (bot: MatrixBot, roomId: string, txnId: string, content: object) =>
  call(bot, 'PUT', `${roomPath(roomId)}/send/m.room.message/${encodeURIComponent(txnId)}`, sentSchema, content);
