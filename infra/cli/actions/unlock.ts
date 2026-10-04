import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { menuPath } from '../../lib/operator-actions';
import { type KeyPair, resolveOperatorIdentity } from '../../lib/scaleway/operator-identity';
import { buildProviderEnv } from '../../lib/scaleway/provider-env';
import { forceUnlock, type LockInfo, lockKey, makeControlClient, peekLock, type S3Like, stateBucket } from '../../lib/stack/control-store';
import {
  checkpointKey,
  clearPendingCreates,
  type PendingClearEffects,
  type PendingOperation,
  planPendingClear,
  readPendingOperations,
} from '../../lib/stack/pending-operations';
import { checkMark, crossMark, pc, warningMark } from '../../lib/utils/cli-output';
import { errorMessage } from '../../lib/utils/errors';
import { infraDir } from '../../lib/utils/paths';
import {
  acquireStackLockOrExit,
  confirmOrDefault,
  endAction,
  type InfraContext,
  keyPairOrPrompt,
  pulumiLoginAndSelect,
  resolveVerifiedPassphrase,
  stackNameFor,
} from '../shared';

/** Gitignored folder for the state exports taken before a state edit: the rollback copies. */
const STATE_BACKUP_DIR = resolve(infraDir, '.state-backups');

/**
 * What the stack lock is at `now`: `none` without one, `expired` once its lease lapsed (the run that held it is gone), `live` while the
 * lease still runs. A holder renews its lease while it works, so a live lock most likely belongs to a run in progress.
 */
export function lockVerdict(held: Pick<LockInfo, 'expiresAt'> | undefined, now: number): 'none' | 'expired' | 'live' {
  if (!held) return 'none';
  return Date.parse(held.expiresAt) <= now ? 'expired' : 'live';
}

/**
 * Clear what an interrupted apply or deploy left behind: a stale conditional-write stack lock, then the operations the Pulumi state still records as
 * in flight. An expired lock is removed without a question; a live one only after the operator confirms, and declining ends the action.
 */
export async function runUnlock(context: InfraContext): Promise<void> {
  const { appConfig } = context;
  const targetStack = stackNameFor(context);

  // The admin application key, as Apply and the deploy lock with: the state bucket admits only the admin and CI deploy applications, any other key 403s here.
  const key = await keyPairOrPrompt(resolveOperatorIdentity().admin, 'Scaleway admin application key');

  const s3 = await makeControlClient(appConfig.s3.region, key.accessKey, key.secretKey);
  const held = await peekLock(s3, stateBucket(appConfig.slug), lockKey(targetStack));
  const verdict = lockVerdict(held, Date.now());
  if (!held) {
    console.info(`${pc.dim('No lock present for')} ${targetStack}.`);
  } else {
    console.info(
      `Lock held by ${pc.cyan(held.owner)} (operation: ${held.operation}, since ${held.acquiredAt}, ${verdict === 'expired' ? 'already expired' : `expires ${held.expiresAt}`}).`,
    );
    if (verdict === 'live') {
      console.warn(
        `${warningMark} This lock has not expired: a run renews its lock while it works, so that run is most likely still going.\n` +
          '  Removing the lock lets a second run change the stack at the same time. A dead run frees its lock within minutes.',
      );
      if (!(await confirmOrDefault({ message: `Remove the live lock of ${held.owner}?`, default: false }))) {
        console.info('Lock left in place. The Pulumi state was not reviewed: the operations in it may belong to the run that holds the lock.');
        return;
      }
    }
    const removed = await forceUnlock(s3, stateBucket(appConfig.slug), lockKey(targetStack));
    if (removed) {
      console.info(`${checkMark} Cleared lock held by ${pc.cyan(removed.owner)} (operation: ${removed.operation}, since ${removed.acquiredAt}).`);
    } else {
      console.info(pc.dim('The lock was released before it was removed.'));
    }
  }

  await reviewPendingOperations(context, { s3, key, stack: targetStack });
}

/** One pending operation as a listing line; a create says whether the state already holds its resource. */
function operationLine(operation: PendingOperation): string {
  const recorded = operation.kind === 'creating' ? (operation.inState ? '  (recorded in state)' : '  (NOT in state)') : '';
  return `  ${operation.kind.padEnd(9)} ${operation.type}  ${pc.dim(operation.urn)}${pc.dim(recorded)}`;
}

/**
 * List the operations an interrupted Pulumi run left in the stack checkpoint and offer to drop the pending creates. Interrupted updates and deletes
 * are reported with the refresh that resolves them, never cleared here.
 */
async function reviewPendingOperations(context: InfraContext, opts: { s3: S3Like; key: KeyPair; stack: string }): Promise<void> {
  const bucket = stateBucket(context.appConfig.slug);
  let operations: PendingOperation[] | undefined;
  try {
    operations = await readPendingOperations(opts.s3, bucket, opts.stack);
  } catch (error) {
    console.warn(`${warningMark} Could not read the stack checkpoint for interrupted Pulumi operations: ${errorMessage(error)}`);
    return;
  }
  if (!operations) {
    console.info(pc.dim(`No stack checkpoint at s3://${bucket}/${checkpointKey(opts.stack)}: no interrupted Pulumi operations to review.`));
    return;
  }
  if (operations.length === 0) {
    console.info(pc.dim('No interrupted Pulumi operations in the state.'));
    return;
  }

  console.info(`\n${warningMark} ${operations.length} operation(s) an interrupted Pulumi run left in the state:`);
  for (const operation of operations) console.info(operationLine(operation));
  const plan = planPendingClear(operations);
  if (plan.others.length > 0) {
    console.info(
      '\n  An interrupted update or delete is resolved by a refresh: it reads each resource from Scaleway into the state and clears these records.\n' +
        `  Run "${menuPath('preview')}" first to see the drift a refresh records, then: ${pc.cyan(`pulumi refresh --stack ${opts.stack}`)}\n` +
        `  ${pc.dim('(logged in to the state backend with the admin application key, PULUMI_CONFIG_PASSPHRASE set, and no run in progress)')}\n` +
        `  ${pc.dim('Nothing is cleared here: dropping the records through an import would drop the interrupted updates and deletes unread.')}`,
    );
    return;
  }

  console.info(
    '\n  A pending create means Pulumi asked Scaleway for the resource and never saw the answer. If that create went through, Scaleway holds a\n' +
      '  resource the state does not track. NOT in state: dropping the entry orphans it, and the next up creates a second one or fails on its name.\n' +
      '  Recorded in state: a later run created the resource again, so the entry is stale, but the first create may have left a duplicate.\n' +
      `  ${pc.bold('Check the Scaleway console for each resource before clearing.')}`,
  );
  if (!(await confirmOrDefault({ message: `Drop ${plan.creates.length} pending create record(s) from the state?`, default: false }))) {
    console.info('Left in place.');
    return;
  }

  const passphrase = await resolveVerifiedPassphrase(context.stackYaml);
  // The admin application key serves the state backend; nothing here calls a Scaleway API beyond the state bucket.
  const env = buildProviderEnv(infraDir, { ...opts.key, projectId: context.projectId, passphrase });
  pulumiLoginAndSelect(infraDir, env, context.appConfig, opts.stack);
  const lease = await acquireStackLockOrExit({ appConfig: context.appConfig, ...opts.key, stack: opts.stack, operation: 'clear-pending' });
  const readPending = async () => {
    const after = await readPendingOperations(opts.s3, bucket, opts.stack);
    if (!after) throw new Error('the stack checkpoint is gone after the import');
    return after;
  };
  let failure: string | undefined;
  try {
    const { backupPath } = await clearPendingCreates(operations, pendingClearEffects(env, opts.stack, readPending));
    console.info(`${checkMark} Dropped ${plan.creates.length} pending create record(s). The export taken before is ${pc.cyan(backupPath)}.`);
    console.info(pc.dim(`  Roll back with: pulumi stack import --stack ${opts.stack} --file ${backupPath}`));
  } catch (error) {
    failure = errorMessage(error);
  } finally {
    await lease.release();
  }
  if (failure) {
    console.error(`${crossMark} Pending creates not cleared: ${failure}`);
    endAction(1);
  }
}

/** `pulumi stack export`/`import` against the logged-in state backend; the export lands in the gitignored backup folder first. */
function pendingClearEffects(env: NodeJS.ProcessEnv, stack: string, readPending: () => Promise<PendingOperation[]>): PendingClearEffects {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const shortStack = stack.split('/').pop() ?? stack;
  return {
    exportState() {
      const result = spawnSync('pulumi', ['stack', 'export', '--stack', stack], {
        cwd: infraDir,
        env,
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
      });
      if (result.status !== 0) throw new Error(`pulumi stack export exited ${result.status}: ${result.stderr.trim().slice(0, 300)}`);
      return result.stdout;
    },
    saveBackup(exported) {
      mkdirSync(STATE_BACKUP_DIR, { recursive: true, mode: 0o700 });
      const path = join(STATE_BACKUP_DIR, `${shortStack}-${stamp}.json`);
      writeFileSync(path, exported, { mode: 0o600 });
      return path;
    },
    importState(document) {
      const path = join(tmpdir(), `infra-state-import-${shortStack}-${stamp}.json`);
      writeFileSync(path, JSON.stringify(document), { mode: 0o600 });
      try {
        const result = spawnSync('pulumi', ['stack', 'import', '--stack', stack, '--file', path], { cwd: infraDir, env, stdio: 'inherit' });
        if (result.status !== 0) throw new Error(`pulumi stack import exited ${result.status}`);
      } finally {
        rmSync(path, { force: true });
      }
    },
    readPending,
  };
}
