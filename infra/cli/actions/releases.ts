import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { appDescription } from '../../lib/deploy/app-description';
import { APPLY_NEEDED, type AppliedEngine, descriptionHash, readAppliedEngine } from '../../lib/deploy/applied-engine';
import { describeChanges } from '../../lib/deploy/description-diff';
import { commitRefs } from '../../lib/deploy/git-remote';
import { findJobDefinition } from '../../lib/deploy/job-runs';
import { readLiveRecord } from '../../lib/deploy/live-record';
import { parseReleaseManifest, type ReleaseManifest, releaseManifestKey } from '../../lib/deploy/release-archives';
import { type RunRecord, runOutcomeText } from '../../lib/deploy/run-record';
import { bucketRunStore, type RunStore } from '../../lib/deploy/run-store';
import { commitName, ENVIRONMENTS_FILE, type RemoteRef, sortedReleases } from '../../lib/deploy/target';
import { machineRoles } from '../../lib/machine-roles';
import { deriveInfra } from '../../lib/naming';
import { actionCommand, actionLabel, menuRow } from '../../lib/operator-actions';
import { type KeyPair, resolveOperatorIdentity } from '../../lib/scaleway/operator-identity';
import { makeS3Client, stateKeyOf } from '../../lib/scaleway/s3-client';
import { makeControlClient, readObjectText, type S3Like } from '../../lib/stack/control-store';
import { accessDenied } from '../../lib/status/providers/runs';
import { checkMark, crossMark, pc, warningMark } from '../../lib/utils/cli-output';
import { infraDir } from '../../lib/utils/paths';
import { ESCAPED, menuSelect } from '../prompts/menu-select';
import { autoAcceptDefaults, confirmOrDefault, endAction, type InfraContext, stackNameFor } from '../shared';
import { deployAndFollow } from './deploy-follow';
import { acquireOperatorKey, type OperatorKey } from './operator-unlock';
import { environmentTarget } from './start-deploy';

const LISTED_RELEASES = 10;
/** How many of the newest runs are searched for a release's deploys. */
const RUNS_SEARCHED = 60;

/** One release of the table: its tag and commit, the newest run that deployed it and how many runs did. */
interface ReleaseRow {
  tag: string;
  sha: string;
  merged: string;
  newest?: RunRecord;
  runs: number;
}

/** The environment's boot-diagnostics bucket on one key: its runs, and its other objects through the control client. */
interface BootDiag {
  store: RunStore;
  control: S3Like;
  bucket: string;
}

async function bootDiagOn(context: InfraContext, key: KeyPair): Promise<BootDiag> {
  const state = stateKeyOf(key, context.projectId);
  const region = context.appConfig.s3.region;
  const bucket = deriveInfra(context.appConfig).naming.bootDiagBucket;
  return {
    store: bucketRunStore(await makeS3Client(region, state.accessKey, state.secretKey), bucket),
    control: await makeControlClient(region, state.accessKey, state.secretKey),
    bucket,
  };
}

/** `Nov 2` for a commit's date in this checkout's git; none for a commit it does not hold. */
function mergedDays(shas: readonly string[]): Map<string, string> {
  const days = new Map<string, string>();
  if (shas.length === 0) return days;
  const log = spawnSync('git', ['log', '--no-walk=unsorted', '--ignore-missing', '--format=%H %cI', ...shas], {
    cwd: join(infraDir, '..'),
    encoding: 'utf8',
  });
  for (const line of (log.stdout ?? '').split('\n')) {
    const [sha, at] = line.split(' ');
    if (sha && at) days.set(sha, new Date(at).toLocaleDateString('en', { month: 'short', day: 'numeric', timeZone: 'UTC' }));
  }
  return days;
}

/** The newest releases with the newest run of each among the environment's last {@link RUNS_SEARCHED} runs, which run ids name by commit. */
async function releaseRows(store: RunStore, refs: readonly RemoteRef[]): Promise<ReleaseRow[]> {
  const releases = sortedReleases(refs).slice(0, LISTED_RELEASES);
  const runs = await store.listRuns(RUNS_SEARCHED);
  const days = mergedDays(releases.map((release) => release.sha));
  return Promise.all(
    releases.map(async ({ tag, sha }) => {
      const ofRelease = runs.filter((run) => run.endsWith(`-${sha.slice(0, 10)}`));
      const newest = ofRelease[0] ? await store.currentRecord(ofRelease[0]) : undefined;
      return { tag, sha, merged: days.get(sha) ?? '', newest, runs: ofRelease.length };
    }),
  );
}

/** How a release's deploys ended, from its newest run: red for a failure, yellow for one that waits on the operator. */
function deployText(row: ReleaseRow): string {
  if (!row.newest) return pc.dim('no run on record');
  const text = `${runOutcomeText(row.newest)}${row.runs > 1 ? ` · ${row.runs} runs` : ''}`;
  if (row.newest.outcome === 'failed') return pc.red(text);
  return row.newest.outcome === 'blocked' || row.newest.outcome === APPLY_NEEDED ? pc.yellow(text) : text;
}

/** The commit the environment serves: the primary role's in the live record, none before the first deploy. */
async function servingCommit(context: InfraContext, diag: BootDiag): Promise<string | undefined> {
  const primary = machineRoles(context.appConfig).find((role) => role.primary);
  if (!primary) return undefined;
  const { record } = await readLiveRecord(diag.control, diag.bucket, stackNameFor(context));
  return record.roles[primary.role]?.commit;
}

/** A release's manifest, which the deploy reuses with its archives; undefined once the bucket let it expire, or before its first build. */
async function readManifest(diag: BootDiag, sha: string): Promise<ReleaseManifest | undefined> {
  const { body } = await readObjectText(diag.control, diag.bucket, releaseManifestKey(sha));
  return body ? parseReleaseManifest(body, sha) : undefined;
}

/**
 * Whether a release can deploy on the applied engine, said in lines: its build kept or not, and its description against the applied one.
 * False when the deploy would end apply needed whatever is done here: the release describes the app otherwise, or predates descriptions.
 */
function deployable(tag: string, manifest: ReleaseManifest | undefined, applied: AppliedEngine | undefined): boolean {
  console.info(
    manifest
      ? `  ${checkMark} Its build is kept: the deploy skips the build.`
      : `  ${pc.dim('○')} Its build is gone (kept 60 days): the deploy builds it again, about 5 minutes.`,
  );
  if (manifest && !manifest.description) {
    console.warn(`  ${warningMark} ${tag} is older than the applied engine, which cannot deploy it: roll forward to a newer release.`);
    return false;
  }
  if (!manifest?.description || !applied) {
    console.info(`  ${pc.dim('○')} Whether it needs an apply shows in its build: a deploy that needs one ends "${APPLY_NEEDED}" before any change.`);
    return true;
  }
  if (manifest.description === applied.descriptionHash) {
    console.info(`  ${checkMark} Same infrastructure as the applied one: no apply needed.`);
    return true;
  }
  console.warn(`  ${warningMark} It needs an apply from a checkout at ${tag} first (${menuRow('changes').label}).`);
  if (manifest.describes && applied.describes) console.warn(pc.dim(`    ${describeChanges(applied.describes, manifest.describes).join(', ')}`));
  return false;
}

/**
 * The environment's last releases, each with how its newest deploy ended and the one that serves, on the observer key; then, at a terminal,
 * a pick of an earlier one to deploy again on the operator key, after saying whether its build is kept and whether it needs an apply. A
 * scheduled run starts no target that has a run under its retry counter, so the environment stays on the pick until its target moves, or
 * the target's runs expire after 60 days; a line in the environments file holds it for longer.
 */
export async function runReleases(context: InfraContext): Promise<void> {
  const { observer } = resolveOperatorIdentity();
  if (!observer) {
    console.error(
      `${crossMark} ${actionLabel('releases')} reads with the observer key, and this machine has none: \`${actionCommand('identity')}\` puts one here.`,
    );
    return endAction(1);
  }
  const environment = context.environment;
  const diag = await bootDiagOn(context, observer);
  const [refs, live, applied] = await Promise.all([
    commitRefs(),
    servingCommit(context, diag),
    readAppliedEngine(diag.control, diag.bucket, environment),
  ]);
  if (!refs) {
    console.error(
      `${crossMark} The repository did not answer, so no release can be listed: check the repository in package.json, and the read key of a private one.`,
    );
    return endAction(1);
  }
  const rows = await releaseRows(diag.store, refs);
  if (rows.length === 0) return console.info('The repository has no release yet: a tag such as 0.1.0 publishes one.');
  const serves = (row: ReleaseRow) => live !== undefined && row.sha.startsWith(live);
  const width = Math.max(...rows.map((row) => row.tag.length), 'VERSION'.length) + 2;
  console.info(pc.dim(`\n${actionLabel('releases')} of ${environment}, newest first:\n`));
  console.info(pc.dim(`  ${'VERSION'.padEnd(width)}${'MERGED'.padEnd(8)}DEPLOY`));
  for (const row of rows) {
    console.info(`  ${row.tag.padEnd(width)}${row.merged.padEnd(8)}${deployText(row)}${serves(row) ? `  ${pc.green('● serving')}` : ''}`);
  }
  const earlier = rows.filter((row) => !serves(row));
  if (autoAcceptDefaults() || !process.stdin.isTTY || earlier.length === 0) return;

  console.info('');
  const tag = await menuSelect({
    message: 'Deploy which release again?',
    items: earlier.map((row) => ({ name: row.tag, value: row.tag, description: deployText(row) })),
    escape: 'back',
  });
  if (tag === ESCAPED) return;
  const picked = earlier.find((row) => row.tag === tag);
  if (!picked) return;

  let operator: OperatorKey | undefined;
  const manifest = await readManifest(diag, picked.sha).catch(async (error: unknown) => {
    // A bucket policy that refuses the observer the manifest leaves it to the operator key.
    if (!accessDenied(error)) throw error;
    operator = await acquireOperatorKey(context);
    return readManifest(await bootDiagOn(context, operator), picked.sha);
  });
  console.info('');
  if (!deployable(picked.tag, manifest, applied)) return;
  const name = environment.charAt(0).toUpperCase() + environment.slice(1);
  const until = environment === 'production' ? 'the next release' : 'its target moves';
  console.info(
    `  ${name} stays on ${picked.tag} until ${until}, or 60 days; for longer, a line "${environment} ${picked.tag}" in ${ENVIRONMENTS_FILE}.\n`,
  );
  if (!(await confirmOrDefault({ message: `Deploy ${picked.tag} to ${environment} now?`, default: false }))) return;

  operator ??= await acquireOperatorKey(context);
  const auth = { secretKey: operator.secretKey };
  const { naming, region } = deriveInfra(context.appConfig);
  const definitionId = await findJobDefinition(auth, { region, projectId: context.projectId, name: naming.resource('main') });
  if (!definitionId) {
    console.error(`${crossMark} ${environment} has no main job yet: an apply makes it (\`${actionCommand('apply')}\`).`);
    return endAction(1);
  }
  const outcome = await deployAndFollow(context, operator, definitionId, { sha: picked.sha, retry: 0 }, 'Started');
  if (outcome !== 'deployed') endAction(1);
}

/** The target the newest run left waiting on an apply, with the description its manifest holds; none when it ended otherwise or has none. */
async function waitingRelease(
  context: InfraContext,
  key: KeyPair,
): Promise<{ sha: string; hash: string; describes: Record<string, unknown> } | undefined> {
  const diag = await bootDiagOn(context, key);
  const [run] = await diag.store.listRuns(1);
  const record = run ? await diag.store.currentRecord(run) : undefined;
  if (record?.outcome !== APPLY_NEEDED) return undefined;
  const manifest = await readManifest(diag, record.target);
  return manifest?.description && manifest.describes ? { sha: record.target, hash: manifest.description, describes: manifest.describes } : undefined;
}

/**
 * Before an apply builds its engine: when the newest run ended apply needed and its target's manifest holds the description, say whether
 * this checkout describes the app as the target does, and end the action when it does not, as that apply would publish a description the
 * target lacks and the target would wait again. Nothing is said when any of it cannot be read.
 */
export async function checkWaitingRelease(context: InfraContext, key: KeyPair): Promise<void> {
  const waiting = await waitingRelease(context, key).catch(() => undefined);
  if (!waiting) return;
  const refs = await commitRefs();
  const name = commitName(refs, waiting.sha);
  // The schedule deploys the environment's target: a release that waited and was overtaken by a newer target is no longer what this apply serves.
  const target = await environmentTarget(context).catch(() => undefined);
  if (target && target.sha !== waiting.sha) {
    console.info(
      pc.dim(
        `${name} waited for an apply, and the target moved on to ${commitName(refs, target.sha)}: this apply publishes this checkout's description.`,
      ),
    );
    return;
  }
  const here = await appDescription();
  if (descriptionHash(here) === waiting.hash) {
    console.info(`${checkMark} This checkout describes the app as ${name} does: this apply publishes it and starts ${name} again.`);
    return;
  }
  const ref = sortedReleases(refs ?? []).find((release) => release.sha === waiting.sha)?.tag ?? waiting.sha;
  console.error(`${crossMark} ${name} waits for an apply, and this checkout describes the app otherwise than it does:`);
  console.error(`    ${describeChanges(here, waiting.describes).join(', ')}`);
  console.error(`  Check out ${ref} first: git switch --detach ${ref}, then apply from there.`);
  if (await confirmOrDefault({ message: 'Apply from this checkout anyway?', default: false })) return;
  return endAction(1);
}
