import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';
import { desc, eq, gt, sql } from 'drizzle-orm';
import { syncIncidentsTable, syncStateTable } from '#/modules/entities/sync-state-db';
import { cdcDb } from './lib/db';

/**
 * `pnpm sync:verify` and `pnpm sync:rebuild`: asks the running CDC worker to check its books against the tables, or
 * to rebuild them from the tables, and waits for the answer. The worker does both by itself when it has to; these are
 * for a restore, a test and the bench. Exits 1 when the verify corrected something or the worker did not answer.
 */
async function main(): Promise<void> {
  const request = process.argv[2];
  if (request !== 'verify' && request !== 'rebuild') throw new Error('Usage: sync-request <verify|rebuild>');
  const waitSeconds = Number(process.argv[3] ?? 120);

  const [{ now }] = (await cdcDb.execute<{ now: string }>(sql`SELECT now()::timestamp::text AS now`)).rows;
  await cdcDb
    .insert(syncStateTable)
    .values({ id: 'sync', requested: request, requestedAt: now })
    .onConflictDoUpdate({ target: syncStateTable.id, set: { requested: request, requestedAt: now } });

  const doneAt = request === 'verify' ? syncStateTable.verifiedAt : syncStateTable.rebuiltAt;
  for (let waited = 0; waited < waitSeconds; waited++) {
    const [done] = await cdcDb.select({ generation: syncStateTable.generation }).from(syncStateTable).where(gt(doneAt, now));
    if (done) {
      const [incident] = await cdcDb
        .select()
        .from(syncIncidentsTable)
        .where(gt(syncIncidentsTable.createdAt, now))
        .orderBy(desc(syncIncidentsTable.createdAt));
      if (request === 'rebuild') {
        console.info(`Books rebuilt from the tables. Generation ${done.generation}: clients refetch.`);
        return;
      }
      if (!incident) {
        console.info('Books verified: the counters agree with the tables.');
        return;
      }
      console.error(`Books were wrong: ${incident.corrections.length} counter(s) corrected, generation ${done.generation}.`);
      for (const { channelKey, key, stored, counted } of incident.corrections.slice(0, 50))
        console.error(`  ${channelKey} ${key}: held ${stored}, counted ${counted}`);
      process.exitCode = 1;
      return;
    }
    await sleep(1000);
  }

  await cdcDb.update(syncStateTable).set({ requested: null }).where(eq(syncStateTable.id, 'sync'));
  console.error(`No answer from the CDC worker in ${waitSeconds} s. It answers while it reads the stream: is it running, and is the API reachable?`);
  process.exitCode = 1;
}

await main().finally(() => cdcDb.$client.end());
