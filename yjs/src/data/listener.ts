import type pg from 'pg';
import { decodeLogNotice, type LogNotice, YJS_LOG_CHANNEL } from '#/modules/yjs/helpers/yjs-log';
import { log } from '../lib/pino';
import { createListenerClient } from './db';

/** Reconnect delays: one second after a drop, doubling to thirty while the database stays unreachable. */
const RECONNECT_MIN_MS = 1000;
const RECONNECT_MAX_MS = 30_000;

/** `listening`: notifications arrive. `connecting`: started, and (re)connecting. `off`: never started, or stopped. */
export type LogListenerStatus = 'listening' | 'connecting' | 'off';

interface ListenerHandlers {
  /** Each notice a notification on YJS_LOG_CHANNEL carries; a payload that is not one is ignored. */
  onNotice: (notice: LogNotice) => void;
  /** After every LISTEN, the first included: whatever was notified while no connection listened never arrives. */
  onListening: () => void;
}

let handlers: ListenerHandlers | null = null;
let client: pg.Client | null = null;
let status: LogListenerStatus = 'off';
let attempts = 0;
let retryTimer: ReturnType<typeof setTimeout> | undefined;

/** The listener's state, for `/health?depth=full`. */
export function logListenerStatus(): LogListenerStatus {
  return status;
}

/**
 * Listens on the Yjs log channel on one dedicated connection per relay: every append and retirement, by the backend
 * or any relay, notifies there at commit. A dropped connection is replaced with backoff, and each new LISTEN is
 * followed by `onListening`, the relay's catch-up. Errors never reach the process: under singleVM it is the API.
 */
export function startLogListener(onNotice: ListenerHandlers['onNotice'], onListening: ListenerHandlers['onListening']): void {
  if (handlers) return;
  handlers = { onNotice, onListening };
  status = 'connecting';
  void connect();
}

/** Stops listening and closes the connection; no reconnect follows. */
export async function stopLogListener(): Promise<void> {
  handlers = null;
  status = 'off';
  attempts = 0;
  clearTimeout(retryTimer);
  const current = client;
  client = null;
  await current?.end().catch(() => undefined);
}

async function connect(): Promise<void> {
  const next = createListenerClient();
  client = next;
  next.on('error', (err) => drop(next, err));
  next.on('end', () => drop(next));
  next.on('notification', ({ channel, payload }) => {
    if (channel !== YJS_LOG_CHANNEL || !payload || client !== next) return;
    const notice = decodeLogNotice(payload);
    if (notice) handlers?.onNotice(notice);
  });
  try {
    await next.connect();
    await next.query(`LISTEN ${YJS_LOG_CHANNEL}`);
  } catch (err) {
    drop(next, err);
    return;
  }
  // Stopped, or dropped, while it connected.
  if (client !== next || !handlers) return;
  if (attempts > 0) log.info('Yjs log listener reconnected', { attempts });
  attempts = 0;
  status = 'listening';
  handlers.onListening();
}

/** Retires a connection that failed or ended, once, and schedules its replacement unless the listener stopped. */
function drop(dead: pg.Client, err?: unknown): void {
  if (client !== dead) return;
  client = null;
  dead.end().catch(() => undefined);
  if (!handlers) return;
  status = 'connecting';
  const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_MIN_MS * 2 ** attempts++);
  log.warn(`Yjs log listener lost its connection: reconnecting in ${delay} ms`, { err });
  retryTimer = setTimeout(() => void connect(), delay);
  // The listener never keeps the process alive at shutdown.
  retryTimer.unref();
}
