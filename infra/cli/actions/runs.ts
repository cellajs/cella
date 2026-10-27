import { select } from '@inquirer/prompts';
import {
  accountExcerpt,
  accountFailed,
  type BootAccountReader,
  bucketBootAccountReader,
  releaseAccounts,
  serviceAccountKeys,
} from '../../lib/deploy/boot-accounts';
import { findJobDefinition, type JobRun, listJobRuns, runEnded } from '../../lib/deploy/job-runs';
import { mainJobOutcome } from '../../lib/deploy/main-job';
import { type RunRecord, runSummaryLine } from '../../lib/deploy/run-record';
import { bucketRunStore, type RunStore } from '../../lib/deploy/run-store';
import { deriveInfra } from '../../lib/naming';
import { actionCommand, actionLabel } from '../../lib/operator-actions';
import { resolveOperatorIdentity } from '../../lib/scaleway/operator-identity';
import { makeS3Client, projectAccessKey } from '../../lib/scaleway/s3-client';
import { deployedServices } from '../../lib/services';
import { crossMark, pc, warningMark } from '../../lib/utils/cli-output';
import { errorMessage } from '../../lib/utils/errors';
import { getFlag } from '../../tasks/args';
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
 * What Scaleway says of the job run that wrote a record, when that differs from the record: a record cut short by the job's time limit, or one
 * a key that may write the bucket changed. Scaleway's list of runs is written by no key of the engine.
 */
function disagreement(record: RunRecord, jobRuns: readonly JobRun[]): string {
  const run = jobRuns.find((candidate) => wroteRecord(candidate, record));
  if (!run || !runEnded(run)) return '';
  const outcome = mainJobOutcome(run);
  return outcome === record.outcome ? '' : `  ${warningMark} the job run ended ${outcome} (${run.state})`;
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
    ...records.map((record) => ({ at: record.startedAt, line: `${runSummaryLine(record)}${disagreement(record, opts.jobRuns ?? [])}` })),
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
 * The machines' own accounts, beside the runs: with `sha`, each service's account of that release and the builder's report; without, each
 * service's newest account, a boot outside any run included (a reboot that could not hydrate).
 */
async function showMachines(
  reader: BootAccountReader,
  services: readonly string[],
  opts: { sha?: string; print?: (...lines: string[]) => void },
): Promise<void> {
  const print = opts.print ?? ((...lines: string[]) => console.info(lines.join('\n')));
  if (opts.sha) {
    for (const found of await releaseAccounts(reader, services, opts.sha)) {
      if (!found.account) {
        print(
          `${warningMark} ${found.service}: no account of ${opts.sha.slice(0, 10)}: its boot runner has not finished (its serial console says more)`,
        );
        continue;
      }
      print('', pc.bold(`${found.service} (boot-diag/${found.account.key})${found.account.failed ? ': boot failed' : ''}`), found.account.body);
    }
    const keys = await reader.list();
    const builder = (name: string) => keys.find((key) => key.startsWith('builder/') && key.endsWith(`/${name}`) && key.includes(opts.sha ?? ''));
    for (const name of ['result', 'log']) {
      const key = builder(name);
      if (key) print('', pc.bold(`builder (boot-diag/${key})`), await reader.read(key));
    }
    return;
  }
  const keys = await reader.list();
  for (const service of services) {
    const [newest] = serviceAccountKeys(keys, service);
    if (!newest) {
      print(`${warningMark} ${service}: no account was ever uploaded`);
      continue;
    }
    const body = await reader.read(newest);
    print('', pc.bold(`${service} (boot-diag/${newest})${accountFailed(body) ? ': boot failed' : ''}`), ...accountExcerpt(body));
  }
}

/**
 * The environment's runs, on the observer key: what was deployed when, how it ended and where it stopped, read from the records each deploy
 * writes to the diagnostics bucket (plan §3.8), beside the main job's runs that left none. With `--machines` it shows each service's newest
 * boot account, and with `--sha <sha>` every account of that release with the builder's report. Reads only.
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
  const sha = getFlag(process.argv, '--sha');
  if (sha !== undefined && !/^[0-9a-f]{7,40}$/.test(sha)) {
    console.error(`${crossMark} --sha takes a git SHA of 7 to 40 hex characters, got '${sha}'`);
    return endAction(1);
  }
  if (sha || process.argv.includes('--machines')) {
    const services = deployedServices(context.appConfig.services, context.appConfig.singleVM).map((service) => service.slug);
    return showMachines(bucketBootAccountReader(s3, naming.bootDiagBucket), services, { sha });
  }
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
