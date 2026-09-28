import { lt, or, sql } from 'drizzle-orm';
import { baseDb } from '#/db/db';
import type { BackendJob } from '#/lib/module';
import { baseLog } from '#/lib/pino';
import { oidcPayloadsTable } from '#/modules/oauth-server/oidc-payloads-db';
import { getIsoDate } from '#/utils/iso-date';

/** Consumed codes and rotated refresh tokens stay this long for replay detection, then go. */
const CONSUMED_RETENTION_DAYS = 30;

/** Deletes what the provider no longer reads: expired rows, and consumed rows past their retention. */
export async function sweepOidcPayloads(): Promise<number> {
  const now = getIsoDate();
  const deleted = await baseDb
    .delete(oidcPayloadsTable)
    .where(
      or(
        lt(oidcPayloadsTable.expiresAt, now),
        sql`${oidcPayloadsTable.consumedAt} < now() - interval '${sql.raw(String(CONSUMED_RETENTION_DAYS))} days'`,
      ),
    )
    .returning({ id: oidcPayloadsTable.id });
  if (deleted.length > 0) baseLog.info('oidc_payloads swept', { deleted: deleted.length });
  return deleted.length;
}

/** Hourly, on the jobs service; the quarter-hour offset keeps it clear of the digest tick. */
export const oidcPayloadsSweepJob: BackendJob = {
  name: 'oidc-payloads-sweep',
  cron: '15 * * * *',
  run: () => sweepOidcPayloads(),
};
