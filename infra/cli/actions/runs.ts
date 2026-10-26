import { select } from '@inquirer/prompts';
import { accountExcerpt } from '../../lib/deploy/boot-accounts';
import { findJobDefinition, type JobRun, listJobRuns, runEnded } from '../../lib/deploy/job-runs';
import { type RunRecord, runSummaryLine } from '../../lib/deploy/run-record';
import { bucketRunStore, type RunStore } from '../../lib/deploy/run-store';
import { deriveInfra } from '../../lib/naming';
import { actionCommand, actionLabel } from '../../lib/operator-actions';
import { resolveOperatorIdentity } from '../../lib/scaleway/operator-identity';
import { makeS3Client, projectAccessKey } from '../../lib/scaleway/s3-client';
import { crossMark, pc, warningMark } from '../../lib/utils/cli-output';
import { errorMessage } from '../../lib/utils/errors';
import { autoAcceptDefaults, endAction, type InfraContext } from '../shared';

const LIST_LENGTH = 10;
const LOG_TAIL = 40;

/** The machines' boot accounts a failed rollout's record names: a failed one's error and the end of its log, a missing one said plainly. */
async function bootLines(record: RunRecord, store: RunStore): Promise<string[]> {
  const lines: string[] = [];
  for (const entry of record.boot ?? []) {
    if (!entry.key) {
      lines.push('', `  ${warningMark} ${entry.service}: no account of this release: its boot runner never finished (its serial console says more)`);
      continue;
    }
    if (!entry.failed) continue;
    const body = await store.readBootAccount(entry.key).catch(() => undefined);
    lines.push('', pc.dim(`  ${entry.service}: boot failed (boot-diag/${entry.key})`));
    lines.push(...(body ? accountExcerpt(body).map((line) => `  ${line}`) : ['  (the account has expired or cannot be read)']));
  }
  return lines;
}

/** One run in full: its steps with their durations, how it ended, a failed machine's boot account, and the end of its log. */
async function runDetailLines(record: RunRecord, store: RunStore): Promise<string[]> {
  const log = await store.readLog(record.run);
  return [
    `${pc.bold(record.run)}: ${record.target} to ${record.environment}, ${record.outcome}${record.failedStep ? ` at "${record.failedStep}"` : ''}`,
    ...record.steps.map((step) => `  ${step.outcome === 'ok' ? ' ' : crossMark} ${step.title.padEnd(40)} ${String(step.seconds).padStart(4)} s`),
    ...(record.error ? ['', `  ${record.error}`] : []),
    ...(await bootLines(record, store)),
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

/**
 * A job run that left no record (D27), by Scaleway's state, exit code and message: one that runs still, or one that ended before the engine
 * could write its record (in the fetch or the install).
 */
function runWithoutRecordLine(run: JobRun, environment: string): string {
  const sha = run.environment_variables?.TARGET_SHA?.slice(0, 10) ?? '?';
  const when = (run.created_at ?? '').slice(0, 16).replace('T', ' ');
  if (!runEnded(run)) return `${when}  ${environment}  ${sha}  ${run.state}, no record yet`;
  const code = run.exit_code ? ` (exit ${run.exit_code})` : '';
  return `${when}  ${environment}  ${sha}  ${run.state}${code}, no record${run.error_message ? `: ${run.error_message.replace(/\s+/g, ' ').slice(0, 100)}` : ''}`;
}

/** True when the record was written by that job run: the same target, started while the run ran. */
function wroteRecord(run: JobRun, record: RunRecord): boolean {
  if (record.target !== run.environment_variables?.TARGET_SHA) return false;
  return record.startedAt >= (run.created_at ?? '') && (!run.terminated_at || record.startedAt <= run.terminated_at);
}

/**
 * List the last runs and show one: the newest record, or the one picked when a person is at the prompt. The environment's job runs that left
 * no record are listed beside the records (D27), so a run is never missing from the list.
 */
export async function showRuns(
  store: RunStore,
  opts: { pick: boolean; print?: (line: string) => void; jobRuns?: readonly JobRun[]; environment?: string },
): Promise<void> {
  const print = opts.print ?? ((line: string) => console.info(line));
  const records = (await Promise.all((await store.listRuns(LIST_LENGTH)).map((run) => store.readRecord(run)))).filter((record): record is RunRecord =>
    Boolean(record),
  );
  // A full list's oldest record bounds the job runs: an older run's record is past the list, not missing.
  const since = records.length === LIST_LENGTH ? (records.at(-1)?.startedAt ?? '') : '';
  const unrecorded = (opts.jobRuns ?? []).filter((run) => (run.created_at ?? '') >= since && !records.some((record) => wroteRecord(run, record)));
  const rows = [
    ...records.map((record) => ({ at: record.startedAt, line: runSummaryLine(record) })),
    ...unrecorded.map((run) => ({ at: run.created_at ?? '', line: runWithoutRecordLine(run, opts.environment ?? '') })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  if (rows.length === 0) return print('No run has left a record yet.');
  for (const row of rows.slice(0, LIST_LENGTH)) print(`  ${row.line}`);
  const [newest] = records;
  if (!newest) return;
  const chosen = opts.pick
    ? await select({ message: 'Show which run?', choices: records.map((record) => ({ name: runSummaryLine(record), value: record })) })
    : newest;
  print('');
  for (const line of await runDetailLines(chosen, store)) print(line);
}

/**
 * The environment's runs, on the observer key: what was deployed when, how it ended and where it stopped, read from the records each deploy
 * writes to the diagnostics bucket (plan §3.8), beside the main job's runs that left none. Reads only.
 */
export async function runRuns(context: InfraContext): Promise<void> {
  const { observer } = resolveOperatorIdentity();
  if (!observer) {
    console.error(
      `${crossMark} ${actionLabel('runs')} reads with the observer key, and this machine has none: \`${actionCommand('identity')}\` puts one here.`,
    );
    return endAction(1);
  }
  const { naming, region } = deriveInfra(context.appConfig);
  const s3 = await makeS3Client(context.appConfig.s3.region, projectAccessKey(observer.accessKey, context.projectId), observer.secretKey);
  const auth = { secretKey: observer.secretKey };
  const jobRuns = await findJobDefinition(auth, { region, projectId: context.projectId, name: naming.resource('main') })
    .then((definitionId) => (definitionId ? listJobRuns(auth, { region, projectId: context.projectId, definitionId }) : []))
    .catch((error) => {
      console.warn(`${warningMark} The main job's runs could not be read (${errorMessage(error)}): only runs with a record are listed.`);
      return [];
    });
  console.info(pc.dim(`\n${actionLabel('runs')} of ${context.environment}, newest first:\n`));
  await showRuns(bucketRunStore(s3, naming.bootDiagBucket), {
    pick: Boolean(process.stdin.isTTY) && !autoAcceptDefaults(),
    jobRuns,
    environment: context.environment,
  });
}
