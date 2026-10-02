import { baseDb } from '#/db/db';
import type { LogNotice } from '#/modules/yjs/helpers/yjs-log';
import { notifyYjsLog } from '#/modules/yjs/operations/notify-yjs-log';
import { log } from '#/utils/logger';

/**
 * Tells the relays of a row an API request appended with `notify: false`, once the append committed. A `pg_notify`
 * inside the append transaction takes the database-wide lock Postgres holds from before a notifying commit until its
 * flush, so notifying commits run one at a time (BENCH_YJS_RELEASES.md finding 2): this sends one notification per
 * call, on the base pool, in a statement of its own. The batched notifier, which sends one per document per window,
 * takes this function's place, so callers keep calling it after their commit.
 *
 * Never throws: the row is durable and the request's answer stands. A missed notice reaches a live session at its next
 * live stamp, compaction or handshake.
 */
export async function queueYjsLogNotice(notice: LogNotice): Promise<void> {
  try {
    await notifyYjsLog({ var: { db: baseDb } }, { notices: [notice] });
  } catch (err) {
    log.warn('Notifying the relays of a Yjs log row failed: live sessions get it at their next live stamp', {
      entityType: notice.entityType,
      entityId: notice.entityId,
      err,
    });
  }
}
