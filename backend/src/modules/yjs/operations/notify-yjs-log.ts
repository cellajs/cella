import { sql } from 'drizzle-orm';
import type { DbContext } from '#/core/context';
import { encodeLogNotice, type LogNotice, YJS_LOG_CHANNEL } from '#/modules/yjs/helpers/yjs-log';

interface NotifyYjsLogOpts {
  notices: LogNotice[];
}

/** Notifies each notice on YJS_LOG_CHANNEL in one statement. In a transaction, delivered at commit and never after a rollback. */
export async function notifyYjsLog(ctx: DbContext, { notices }: NotifyYjsLogOpts): Promise<void> {
  if (notices.length === 0) return;
  const payloads = sql.join(
    notices.map((notice) => sql`(${encodeLogNotice(notice)}::text)`),
    sql`, `,
  );
  await ctx.var.db.execute(sql`SELECT pg_notify(${YJS_LOG_CHANNEL}, notice.payload) FROM (VALUES ${payloads}) AS notice(payload)`);
}
