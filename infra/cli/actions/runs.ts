import { select } from '@inquirer/prompts';
import {
  accountExcerpt,
  accountFailed,
  type BootAccountReader,
  bucketBootAccountReader,
  releaseAccounts,
  serviceAccountKeys,
} from '../../lib/deploy/boot-accounts';
import { classifyRun, scalewayStatus } from '../../lib/deploy/failure-class';
import { commitRefs } from '../../lib/deploy/git-remote';
import {
  findJobDefinition,
  isScheduledRun,
  type JobDefinitionFacts,
  type JobRun,
  lastScheduledRun,
  listJobRuns,
  readJobDefinition,
  runEnded,
} from '../../lib/deploy/job-runs';
import { type Growth, type RunRecord, rewriteNote, runSummaryLine, stepLine, wroteRecord } from '../../lib/deploy/run-record';
import { bucketRunStore, type RunStore } from '../../lib/deploy/run-store';
import { commitName, type RemoteRef } from '../../lib/deploy/target';
import { deriveInfra } from '../../lib/naming';
import { actionCommand, actionLabel } from '../../lib/operator-actions';
import { resolveOperatorIdentity } from '../../lib/scaleway/operator-identity';
import { makeS3Client, projectAccessKey } from '../../lib/scaleway/s3-client';
import { deployedServices } from '../../lib/services';
import { type LockInfo, leaseHeldByRun, lockKey, makeControlClient, peekLock } from '../../lib/stack/control-store';
import { runOverrides } from '../../lib/status/providers/runs';
import { getFlag } from '../../lib/utils/args';
import { crossMark, pc, warningMark } from '../../lib/utils/cli-output';
import { errorMessage } from '../../lib/utils/errors';
import { autoAcceptDefaults, endAction, type InfraContext } from '../shared';

const LIST_LENGTH = 10;
const LOG_TAIL = 40;

/**
 * The machines' boot accounts a failed switch's record names: a failed one's error and the end of its log, a missing one said plainly
 * unless a 5xx of Scaleway's API failed the run, which left that machine unmade.
 */
async function bootLines(record: RunRecord, store: RunStore): Promise<string[]> {
  const lines: string[] = [];
  for (const entry of record.boot ?? []) {
    if (!entry.key) {
      if (scalewayStatus(record.error) === undefined) {
        lines.push('', `  ${warningMark} ${entry.service}: no account of this release: its agent never finished (its serial console says more)`);
      }
      continue;
    }
    if (!entry.failed) continue;
    const body = await store.readBootAccount(entry.key).catch(() => undefined);
    lines.push('', pc.dim(`  ${entry.service}: boot failed (boot-diag/${entry.key})`));
    lines.push(...(body ? accountExcerpt(body).map((line) => `  ${line}`) : ['  (the account has expired or cannot be read)']));
  }
  return lines;
}

/** A record or a log whose versions stopped growing: what is shown is the newest version before that. */
function rewriteLines(what: string, growth: Growth<unknown> | undefined): string[] {
  return growth?.rewrite ? [`  ${warningMark} ${what} ${rewriteNote(growth.rewrite)}; shown as it stood before`] : [];
}

/**
 * One run in full: how it ended and, for a run that did not deploy, whose side that is on, its steps with their durations, a failed
 * machine's boot account, and the end of its log, each read by its first version.
 */
async function runDetailLines(reading: Growth<RunRecord>, store: RunStore, refs?: readonly RemoteRef[]): Promise<string[]> {
  const record = reading.newest;
  const log = await store.readLog(record.run);
  const sentence = ['running', 'deployed', 'unchanged'].includes(record.outcome) ? undefined : classifyRun(record).sentence;
  return [
    `${pc.bold(refs ? commitName(refs, record.target) : record.target.slice(0, 10))} ${pc.dim(`(${record.target.slice(0, 10)}, run ${record.run})`)} to ${record.environment}, ${record.outcome}${record.failedStep ? ` at "${record.failedStep}"` : ''}`,
    ...(sentence ? [`  ${sentence}`] : []),
    ...rewriteLines('the record was', reading),
    ...record.steps.map(stepLine),
    ...(record.error && record.error !== sentence ? ['', `  ${record.error}`] : []),
    ...(await bootLines(record, store)),
    ...(log
      ? [
          '',
          pc.dim(`  The end of its log (${LOG_TAIL} lines):`),
          ...rewriteLines('the log was', log),
          ...log.newest
            .trimEnd()
            .split('\n')
            .slice(-LOG_TAIL)
            .map((line) => `  ${line}`),
        ]
      : []),
  ];
}

/**
 * A run started by hand that left no record, by Scaleway's state, exit code and message: one that runs still, or one that ended before the
 * engine could write its record.
 */
function runWithoutRecordLine(run: JobRun, environment: string): string {
  const sha = run.environment_variables?.TARGET_SHA?.slice(0, 10) ?? '?';
  const when = (run.created_at ?? '').slice(0, 16).replace('T', ' ');
  if (!runEnded(run)) return `${when}  ${environment}  ${sha}  ${run.state}, no record yet`;
  const code = run.exit_code ? ` (exit ${run.exit_code})` : '';
  return `${when}  ${environment}  ${sha}  ${run.state}${code}, no record${run.error_message ? `: ${run.error_message.replace(/\s+/g, ' ').slice(0, 100)}` : ''}`;
}

/** A record that says running while no deploy holds the lease under its run: its deploy died, or the job's time limit ended it. */
function interrupted(record: RunRecord, lock: LockInfo | undefined): string {
  return record.outcome === 'running' && !leaseHeldByRun(lock, record.run)
    ? `  ${warningMark} interrupted: no deploy holds the lease under this run`
    : '';
}

/** A run started with values or a command of its own, which no start of the engine sets (D-b): flagged, as only a key holder's start does it. */
function ownValues(run: JobRun | undefined, definition: JobDefinitionFacts | undefined): string {
  const own = run && definition ? runOverrides(run, definition) : [];
  return own.length > 0 ? `  ${warningMark} started with its own values: ${own.join(', ')}` : '';
}

/** When the last scheduled run that did not fail started, as the sentence above the list says it. */
function scheduleSentence(jobRuns: readonly JobRun[], now: number): string {
  const last = lastScheduledRun(jobRuns);
  if (!last?.created_at) return `scheduled runs: none among the main job's newest runs; \`${actionCommand('apply')}\` writes the schedule`;
  return `scheduled runs: last ${Math.floor((now - Date.parse(last.created_at)) / 60_000)} min ago`;
}

/**
 * List the last runs and show one: the newest record, or the one picked when a person is at the prompt. A record is read by its first
 * version, one whose versions stopped growing is flagged as rewritten, and one left running without the lease as interrupted. A run started
 * by hand that left no record is listed beside the records, so a deploy is never missing from the list; a scheduled run that started nothing
 * left none, and one sentence above the list says when the last one ran. With the main job's definition, a run of the newest page started
 * with values or a command of its own is listed and flagged.
 */
export async function showRuns(
  store: RunStore,
  opts: {
    pick: boolean;
    print?: (line: string) => void;
    jobRuns?: readonly JobRun[];
    definition?: JobDefinitionFacts;
    environment?: string;
    /** The environment's lease, which tells a record that runs from one that was interrupted. */
    lock?: LockInfo;
    now?: number;
    /** The repository's tags and heads, which name each run's target. */
    refs?: readonly RemoteRef[];
  },
): Promise<void> {
  const print = opts.print ?? ((line: string) => console.info(line));
  const readings = (await Promise.all((await store.listRuns(LIST_LENGTH)).map((run) => store.readRecord(run)))).filter(
    (reading): reading is Growth<RunRecord> => Boolean(reading),
  );
  const records = readings.map((reading) => reading.newest);
  const jobRuns = opts.jobRuns ?? [];
  if (opts.definition) print(scheduleSentence(jobRuns, opts.now ?? Date.now()));
  // A full list's oldest record bounds the job runs: an older run's record is past the list, not missing.
  const since = records.length === LIST_LENGTH ? (records.at(-1)?.startedAt ?? '') : '';
  const unrecorded = jobRuns.filter(
    (run) =>
      (!isScheduledRun(run) &&
        (run.created_at ?? '') >= since &&
        !records.some((record) => wroteRecord(run, run.environment_variables?.TARGET_SHA, record))) ||
      ownValues(run, opts.definition) !== '',
  );
  const rows = [
    ...readings.map(({ newest: record, rewrite }) => {
      const rewritten = rewrite ? `  ${warningMark} ${rewriteNote(rewrite)}` : '';
      return { at: record.startedAt, line: `${runSummaryLine(record, opts.refs)}${rewritten}${interrupted(record, opts.lock)}` };
    }),
    ...unrecorded.map((run) => ({
      at: run.created_at ?? '',
      line: `${runWithoutRecordLine(run, opts.environment ?? '')}${ownValues(run, opts.definition)}`,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  if (rows.length === 0) return print('No run has left a record yet.');
  for (const row of rows.slice(0, LIST_LENGTH)) print(`  ${row.line}`);
  const [newest] = readings;
  if (!newest) return;
  const chosen = opts.pick
    ? await select({
        message: 'Show which run?',
        choices: readings.map((reading) => ({ name: runSummaryLine(reading.newest, opts.refs), value: reading })),
      })
    : newest;
  print('');
  for (const line of await runDetailLines(chosen, store, opts.refs)) print(line);
}

/**
 * The machines' own accounts, beside the runs: with `sha`, each service's account of that release and the builder's report; without, each
 * service's newest account, a boot outside any run included.
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
        print(`${warningMark} ${found.service}: no account of ${opts.sha.slice(0, 10)}: its agent has not finished (its serial console says more)`);
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
 * writes to the diagnostics bucket, beside the main job's runs that left none. With `--machines` it shows each service's newest
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
  const read = async (): Promise<{ jobRuns: JobRun[]; definition?: JobDefinitionFacts }> => {
    const definitionId = await findJobDefinition(auth, { region, projectId: context.projectId, name: naming.resource('main') });
    if (!definitionId) return { jobRuns: [] };
    const [jobRuns, definition] = await Promise.all([
      listJobRuns(auth, { region, projectId: context.projectId, definitionId }),
      readJobDefinition(auth, { region, definitionId }),
    ]);
    return { jobRuns, definition };
  };
  const [{ jobRuns, definition }, refs] = await Promise.all([
    read().catch((error): Awaited<ReturnType<typeof read>> => {
      console.warn(`${warningMark} The main job's runs could not be read (${errorMessage(error)}): only runs with a record are listed.`);
      return { jobRuns: [] };
    }),
    commitRefs(),
  ]);
  const control = await makeControlClient(context.appConfig.s3.region, projectAccessKey(observer.accessKey, context.projectId), observer.secretKey);
  const lock = await peekLock(control, naming.bootDiagBucket, lockKey(context.environment)).catch(() => undefined);
  console.info(pc.dim(`\n${actionLabel('runs')} of ${context.environment}, newest first:\n`));
  await showRuns(bucketRunStore(s3, naming.bootDiagBucket), {
    pick: Boolean(process.stdin.isTTY) && !autoAcceptDefaults(),
    jobRuns,
    definition,
    environment: context.environment,
    lock,
    refs,
  });
}
