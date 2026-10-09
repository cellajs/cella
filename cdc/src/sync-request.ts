import process from 'node:process';
import { awaitBooksAnswer, requestBooks } from '#/modules/entities/sync-requests';
import { cdcDb } from './lib/db';

/**
 * `pnpm sync:verify` and `pnpm sync:rebuild`: asks the running CDC worker to check its books against the tables, or
 * to rebuild them from the tables, and waits for the answer. The worker does both by itself when it has to; these are
 * for a restore, a test and the bench. Exits 1 when the verify found the books wrong or the worker did not answer.
 */
async function main(): Promise<void> {
  const request = process.argv[2];
  if (request !== 'verify' && request !== 'rebuild') throw new Error('Usage: sync-request <verify|rebuild>');
  const waitSeconds = Number(process.argv[3] ?? 120);

  const since = await requestBooks(cdcDb, request);
  const { answered, differences, generation } = await awaitBooksAnswer(cdcDb, request, since, waitSeconds);

  if (!answered) {
    console.error(
      `No answer from the CDC worker in ${waitSeconds} s. It answers while it reads the stream: is it running, and is the API reachable?`,
    );
    process.exitCode = 1;
  } else if (request === 'rebuild') {
    console.info(`Books rebuilt from the tables. Generation ${generation}: clients refetch.`);
  } else if (differences.length === 0) {
    console.info('Books verified: the counters agree with the tables.');
  } else {
    console.error(`Books were wrong: ${differences.length} counter(s) differed from the tables.`);
    for (const { channelKey, key, stored, counted } of differences.slice(0, 50))
      console.error(`  ${channelKey} ${key}: held ${stored}, counted ${counted}`);
    console.error(`The worker rebuilt the books from the tables. Generation ${generation}: clients refetch.`);
    process.exitCode = 1;
  }
}

await main().finally(() => cdcDb.$client.end());
