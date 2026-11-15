import { performance } from 'node:perf_hooks';
import type { Vu } from '@cellajs/cli/bench';
import { nanoid } from 'nanoid';
import pg from 'pg';
import { uuidv7 } from 'uuidv7';
import { benchCookie, ORG_PATH } from '../bench-user';
import { DB_URL } from '../config';
import { insertSeedRows } from '../seed-utils';
import { ORG_ID, userId } from '../seeds/ids';
import { loadtestOrgMembership } from '../seeds/membership';
import { TOTAL_USERS } from '../seeds/user-constants';
import { createSyncClient, SYNC_COUNTERS, SYNC_HISTOGRAMS } from './client';
import type { BenchProduct } from './product';

export const REVOCATION_COUNTERS = [
  ...SYNC_COUNTERS,
  'bench.rows_written',
  'sync.frames_after_revoke',
  'sync.reads_after_revoke',
  'sync.kept_in_tolerance',
  'sync.bystander_frames',
  'sync.revoke_unheard',
] as const;
export const REVOCATION_HISTOGRAMS = [...SYNC_HISTOGRAMS, 'sync.revoke_signal_ms'] as const;
type RevocationVu = Vu<(typeof REVOCATION_COUNTERS)[number], (typeof REVOCATION_HISTOGRAMS)[number]>;

/** The last bench users, which load scenarios reach only with more than a thousand VUs. */
const targetUser = TOTAL_USERS - 1;
const bystanderUser = TOTAL_USERS - 2;
const revokerUser = TOTAL_USERS - 3;
const writerUser = TOTAL_USERS - 4;

/** The writer edits this often, before and after the removal. */
const editEveryMs = 100;
const beforeMs = 1_000;
const afterMs = 3_000;
/** A range key answers for 10 s (`rangeKeyLifetimeMs` in `range-answers.ts`): past this the target's key is dead. */
const keyDeadAfterMs = 11_000;

/** Puts the target's membership back as the seed made it. Later scenarios sign in as the user too. */
async function restoreMembership(): Promise<void> {
  const pool = new pg.Pool({ connectionString: DB_URL, max: 1 });
  try {
    await pool.query('DELETE FROM memberships WHERE user_id = $1 AND organization_id = $2', [userId(targetUser), ORG_ID]);
    const row = { ...loadtestOrgMembership(targetUser), createdAt: new Date().toISOString() };
    await insertSeedRows(pool, { table: 'memberships', order: 50, rows: () => [] }, [row]);
  } finally {
    await pool.end();
  }
}

/**
 * A target and a bystander hold streams while a writer edits; then a third member removes the target. Right after the
 * removal answers, the organization's frontier is read: any change frame the target hears that names a later row
 * leaked, and so does any read of the list the target still gets answered. The bystander must keep hearing.
 *
 * The target also replays the bystander's last range read with the range key it heard before its removal. A kept
 * answer may serve it while the key lives, which is counted; once the key's lifetime passed it must be refused.
 */
export async function runRevocation(vu: RevocationVu, product: BenchProduct): Promise<void> {
  let removedAt: number | null = null;
  let frontier: number | null = null;
  let signalAt: number | null = null;

  const target = createSyncClient({
    client: vu.client(),
    cookie: benchCookie(targetUser),
    product,
    mode: 'off',
    metrics: vu,
    onChange(change) {
      if (frontier === null) return;
      const last = frontier;
      if (change.rows.some((row) => row.seq !== null && row.seq > last) || (change.overflow?.untilSeq ?? 0) > last)
        vu.counter('sync.frames_after_revoke');
    },
    onSignal(signal, at) {
      if (removedAt !== null && signalAt === null && signal.type === 'membership.changed' && signal.organizationId === ORG_ID) signalAt = at;
    },
  });
  const bystander = createSyncClient({
    client: vu.client(),
    cookie: benchCookie(bystanderUser),
    product,
    mode: 'immediate',
    metrics: vu,
    onChange() {
      if (frontier !== null) vu.counter('sync.bystander_frames');
    },
  });
  // The revoker only asks catchup for the frontier.
  const revoker = createSyncClient({ client: vu.client(), cookie: benchCookie(revokerUser), product, mode: 'off', metrics: vu });
  await Promise.all([target.connect(), bystander.connect()]);

  const stop = new AbortController();
  const writer = (async () => {
    const { http } = vu.client();
    const sourceId = uuidv7();
    for (let i = 0; !stop.signal.aborted; i++) {
      const edit = product.edit(i % product.total, `bench-revocation-${nanoid(8)}`, { sourceId, intentMs: Date.now() });
      const res = await http.patch(edit.path, {
        json: edit.json,
        headers: { cookie: benchCookie(writerUser) },
        name: `PATCH ${product.listPath('')}/:id`,
      });
      if (res.status === 200) vu.counter('bench.rows_written');
      await vu.think(editEveryMs).catch(() => {});
    }
  })();

  try {
    await vu.think(vu.short ? 200 : beforeMs);
    const calledAt = performance.now();
    const res = await vu.client().http.post(`${ORG_PATH}/members/~batch-delete?entityId=${ORG_ID}&entityType=organization`, {
      json: { ids: [userId(targetUser)] },
      headers: { cookie: benchCookie(revokerUser) },
      name: 'POST /members/~batch-delete',
    });
    if (!res.ok) throw new Error(`removing the target answered ${res.status}`);
    removedAt = calledAt;
    const staleKey = target.rangeKey;
    const probe = vu.client().http;
    const keyedReplay = () => {
      const url = bystander.lastRangeUrl;
      if (!url || !staleKey) return null;
      return probe.get(url, {
        headers: { cookie: benchCookie(targetUser), 'x-range-key': staleKey },
        name: `GET ${product.listPath('')} (revoked, keyed)`,
      });
    };
    const answer = await revoker.catchup();
    if (answer.frontier === null) throw new Error(`the revoker's catchup answered ${answer.status}`);
    frontier = answer.frontier;

    await vu.think(vu.short ? 500 : afterMs);
    const read = await probe.get(`${product.listPath(ORG_PATH)}?afterSeq=0&untilSeq=${frontier}&maxPageSize=1`, {
      headers: { cookie: benchCookie(targetUser) },
      name: `GET ${product.listPath('')} (revoked)`,
    });
    if (read.ok) vu.counter('sync.reads_after_revoke');
    if ((await target.catchup()).status === 'ok') vu.counter('sync.reads_after_revoke');
    if (signalAt === null) vu.counter('sync.revoke_unheard');
    else vu.histogram('sync.revoke_signal_ms', signalAt - calledAt);

    if ((await keyedReplay())?.headers['x-range-answer'] === 'kept') vu.counter('sync.kept_in_tolerance');
    await vu.think(Math.max(0, keyDeadAfterMs - (performance.now() - calledAt)));
    if ((await keyedReplay())?.ok) vu.counter('sync.reads_after_revoke');
  } finally {
    stop.abort();
    await writer;
    await Promise.all([target, bystander, revoker].map((client) => client.disconnect()));
    await restoreMembership();
  }
}
