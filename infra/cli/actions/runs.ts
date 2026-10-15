import { select } from '@inquirer/prompts';
import { type RunRecord, runSummaryLine } from '../../lib/deploy/run-record';
import { bucketRunStore, type RunStore } from '../../lib/deploy/run-store';
import { deriveInfra } from '../../lib/naming';
import { actionCommand, actionLabel } from '../../lib/operator-actions';
import { resolveOperatorIdentity } from '../../lib/scaleway/operator-identity';
import { makeS3Client, projectAccessKey } from '../../lib/scaleway/s3-client';
import { crossMark, pc } from '../../lib/utils/cli-output';
import { autoAcceptDefaults, endAction, type InfraContext } from '../shared';

const LIST_LENGTH = 10;
const LOG_TAIL = 40;

/** One run in full: its steps with their durations, how it ended, and the end of its log. */
function runDetailLines(record: RunRecord, log: string | undefined): string[] {
  return [
    `${pc.bold(record.run)}: ${record.target} to ${record.environment}, ${record.outcome}${record.failedStep ? ` at "${record.failedStep}"` : ''}`,
    ...record.steps.map((step) => `  ${step.outcome === 'ok' ? ' ' : crossMark} ${step.title.padEnd(40)} ${String(step.seconds).padStart(4)} s`),
    ...(record.error ? ['', `  ${record.error}`] : []),
    ...(log
      ? [
          '',
          pc.dim(`  The end of its log (${LOG_TAIL} lines):`),
          ...log
            .trimEnd()
            .split('\n')
            .slice(-LOG_TAIL)
            .map((line) => `  ${line}`),
        ]
      : []),
  ];
}

/** List the last runs and show one: the newest, or the one picked when a person is at the prompt. */
export async function showRuns(store: RunStore, opts: { pick: boolean; print?: (line: string) => void }): Promise<void> {
  const print = opts.print ?? ((line: string) => console.info(line));
  const runs = await store.listRuns(LIST_LENGTH);
  if (runs.length === 0) return print('No run has left a record yet.');
  const records = (await Promise.all(runs.map((run) => store.readRecord(run)))).filter((record): record is RunRecord => Boolean(record));
  for (const record of records) print(`  ${runSummaryLine(record)}`);
  const [newest] = records;
  if (!newest) return;
  const chosen = opts.pick
    ? await select({ message: 'Show which run?', choices: records.map((record) => ({ name: runSummaryLine(record), value: record })) })
    : newest;
  print('');
  for (const line of runDetailLines(chosen, await store.readLog(chosen.run))) print(line);
}

/**
 * The environment's runs, on the observer key: what was deployed when, how it ended and where it stopped, read from the records each deploy
 * writes to the diagnostics bucket (plan §3.8). Reads only.
 */
export async function runRuns(context: InfraContext): Promise<void> {
  const { observer } = resolveOperatorIdentity();
  if (!observer) {
    console.error(
      `${crossMark} ${actionLabel('runs')} reads with the observer key, and this machine has none: \`${actionCommand('identity')}\` puts one here.`,
    );
    return endAction(1);
  }
  const { naming } = deriveInfra(context.appConfig);
  const s3 = await makeS3Client(context.appConfig.s3.region, projectAccessKey(observer.accessKey, context.projectId), observer.secretKey);
  console.info(pc.dim(`\n${actionLabel('runs')} of ${context.environment}, newest first:\n`));
  await showRuns(bucketRunStore(s3, naming.bootDiagBucket), { pick: Boolean(process.stdin.isTTY) && !autoAcceptDefaults() });
}
