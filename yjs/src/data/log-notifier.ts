import { type LogNotice, YJS_LOG_NOTICE_MAX_IDS } from '#/modules/yjs/helpers/yjs-log';
import { notifyYjsLog } from '#/modules/yjs/operations/notify-yjs-log';
import { type DocKey, YJS_LOG_NOTICE_DELAY_MS } from '../constants';
import { log } from '../lib/pino';
import { db } from './db';

/** Announces a batch of notices on the log channel; resolves once they are sent. */
type SendNotices = (notices: LogNotice[]) => Promise<void>;

/**
 * Collects the rows a relay appended, each once its append committed, and announces them `delayMs` after the first of
 * a batch: one notice per document with every row id it collected (split at YJS_LOG_NOTICE_MAX_IDS), all in one `send`.
 * A row whose append rolled back is never queued, so no relay hears of it. One send runs at a time: a notifying commit
 * waits for the cluster-wide notify lock, which another notifier may hold for seconds, and a send that waits holds a
 * pool connection, so concurrent sends could take the connections the appends need. Rows queued meanwhile go in the
 * next batch, sent once the one in flight returns. A failed send is logged and dropped: other relays catch those rows up
 * as after a missed notification, at their next handshake, compaction or live stamp.
 */
export function createLogNotifier(send: SendNotices, delayMs: number) {
  const pending = new Map<string, { doc: DocKey; ids: number[] }>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let sending: Promise<void> | undefined;

  /** Arms the next batch's send, unless one is armed or in flight: that one arms it when it returns. */
  const arm = (): void => {
    if (timer || sending || pending.size === 0) return;
    timer = setTimeout(() => void flush(), delayMs);
    // A batch never keeps the process alive: shutdown flushes it before the pool closes.
    timer.unref();
  };

  const sendPending = async (): Promise<void> => {
    const notices: LogNotice[] = [];
    for (const { doc, ids } of pending.values()) {
      for (let at = 0; at < ids.length; at += YJS_LOG_NOTICE_MAX_IDS) {
        notices.push({
          tenantId: doc.tenantId,
          entityType: doc.entityType,
          entityId: doc.entityId,
          logIds: ids.slice(at, at + YJS_LOG_NOTICE_MAX_IDS),
        });
      }
    }
    pending.clear();
    try {
      await send(notices);
    } catch (err) {
      log.warn(`Announcing ${notices.length} Yjs log notices failed: other relays catch their rows up later`, { err });
    }
  };

  /** Sends what is queued once the send in flight, if any, returned; at shutdown, before the pool closes. */
  const flush = async (): Promise<void> => {
    clearTimeout(timer);
    timer = undefined;
    while (sending) await sending;
    if (pending.size === 0) return;
    sending = sendPending().finally(() => {
      sending = undefined;
      arm();
    });
    await sending;
  };

  /** Queues a committed row of `doc`; the first row of a batch arms its send. */
  const queue = (doc: DocKey, id: number): void => {
    const key = `${doc.tenantId}:${doc.entityType}:${doc.entityId}`;
    const entry = pending.get(key);
    if (entry) entry.ids.push(id);
    else pending.set(key, { doc: { tenantId: doc.tenantId, entityType: doc.entityType, entityId: doc.entityId }, ids: [id] });
    arm();
  };

  return { queue, flush };
}

/** The relay's notifier: each batch is one `pg_notify` statement on the pool, a transaction of its own. */
export const logNotifier = createLogNotifier((notices) => notifyYjsLog({ var: { db } }, { notices }), YJS_LOG_NOTICE_DELAY_MS);
