import { spawnSync } from 'node:child_process';
import { confirm, input } from '@inquirer/prompts';
import { deriveInfra } from '../../lib/naming';
import { actionLabel } from '../../lib/operator-actions';
import { removeMachines } from '../../lib/scaleway/machines';
import { describeKey } from '../../lib/scaleway/operator-identity';
import { buildProviderEnv } from '../../lib/scaleway/provider-env';
import { stateKeyOf } from '../../lib/scaleway/s3-client';
import { deleteApplicationCascade, deleteGroup, listManagedPrincipals, removeBootstrapDnsGrant } from '../../lib/scaleway/scaleway-iam';
import { checkMark, pc, tildeMark, warningMark } from '../../lib/utils/cli-output';
import { errorMessage } from '../../lib/utils/errors';
import { infraDir } from '../../lib/utils/paths';
import { builderPrefix } from '../../tasks/build-release';
import { acquireStackLockOrExit, type InfraContext, pulumiLoginAndSelect, resolveVerifiedPassphrase, stackNameFor } from '../shared';
import { admitOperatorOrExit } from './operator-apply';
import { acquireIdentityKey, acquirePrivilegedKey, type OperatorKey } from './operator-unlock';
import { type OwnerKey, printRevokeReminder } from './owner-key';

/** The applications a cleanup may delete, apart from the one the run itself authenticates as: deleting that one revokes the key every later call needs. */
export function splitOwnApplication<App extends { id: string }>(
  applications: readonly App[],
  ownApplicationId: string | undefined,
): { own?: App; others: App[] } {
  return {
    own: applications.find((app) => app.id === ownApplicationId),
    others: applications.filter((app) => app.id !== ownApplicationId),
  };
}

/**
 * Destroy an environment: state-backend login, AWS_ and SCW_ env mapping, stack selection, `destroy --refresh`, then optional IAM principal cleanup.
 * The destroy runs on the operator key, as an apply does; deleting the identities writes IAM, so that part asks for an Owner API key.
 * Production stacks require typing `<slug>-production`, and their frontend/private buckets carry `protect: true`, so Pulumi refuses to
 * delete them until protection is lifted in code.
 */
export async function runTeardown(context: InfraContext): Promise<void> {
  const { appConfig } = context;
  const mode = context.environment;
  const confirmToken = `${appConfig.slug}-${mode}`;

  console.info(`\n${pc.bold(pc.redBright(actionLabel('teardown')))} ${pc.dim(`(${confirmToken})`)}\n`);
  console.info(pc.dim('Destroys every Pulumi-managed resource of this stack (VMs, LB, buckets, DB…), then optionally deletes the IAM principals.'));
  if (mode === 'production') {
    console.warn(
      `${warningMark} ${pc.bold('This is PRODUCTION.')} Protected resources (frontend/private buckets, DB) will refuse destruction unless 'protect' is lifted in code: that refusal is deliberate.`,
    );
  }

  const typed = await input({ message: `Type ${pc.bold(confirmToken)} to continue` });
  if (typed.trim() !== confirmToken) {
    console.info('Token mismatch; nothing was touched.');
    return;
  }

  if (!(await destroyStack(context, await acquirePrivilegedKey(context)))) return;

  // IAM principal cleanup: group members plus the org-wide bootstrap DNS residue, enumerated via the per-mode group (REQ-1) and never by name-guessing.
  const cleanupIam = await confirm({
    message: `Also delete the IAM principals (group ${confirmToken}, its applications, keys, and policies)? It takes your Owner API key.`,
    default: mode !== 'production',
  });
  if (!cleanupIam) {
    console.info(pc.dim('IAM principals kept. Re-run teardown later or delete them in the console.'));
    return;
  }
  const ownerKey = await acquireIdentityKey(context, 'Deleting the identities writes IAM.');
  try {
    await deleteIdentities(context, ownerKey);
  } finally {
    await ownerKey.release();
  }
  printRevokeReminder();
}

/** Destroy the stack's resources and remove it from the backend; true when the destroy completed. */
async function destroyStack(context: InfraContext, operator: OperatorKey): Promise<boolean> {
  const { appConfig } = context;
  const { accessKey, secretKey, organizationId } = operator;
  const passphrase = await resolveVerifiedPassphrase(context.stackYaml);
  const targetStack = stackNameFor(context);

  // The operator key serves both sides, as in Apply; buckets written before it was admitted let it in first.
  await admitOperatorOrExit(context, { ...operator, passphrase, stack: targetStack });
  const env = buildProviderEnv(infraDir, { accessKey, secretKey, projectId: context.projectId, passphrase, organizationId });
  pulumiLoginAndSelect(infraDir, env, appConfig, targetStack);

  const stackLock = await acquireStackLockOrExit({
    appConfig,
    ...stateKeyOf(operator, context.projectId),
    stack: targetStack,
    operation: 'teardown',
  });

  // --refresh first so the destroy plan matches live state; a stale local view of generations/LB would orphan real resources.
  // The lock releases in a finally so a throw between acquire and release cannot strand it until the TTL.
  let destroy: ReturnType<typeof spawnSync>;
  try {
    // A builder machine is no resource of the program, and its server holds the stack's security group.
    const { naming, zone } = deriveInfra(appConfig);
    for (const name of await removeMachines({ secretKey, projectId: context.projectId, zone, prefix: builderPrefix(naming.resource) })) {
      console.info(`  ${tildeMark} deleted builder ${name}`);
    }
    console.info(pc.dim('\n→ pulumi destroy --refresh (this may take several minutes)…'));
    destroy = spawnSync('pulumi', ['destroy', '--refresh', '--yes', '--stack', targetStack], { cwd: infraDir, env, stdio: 'inherit' });
  } finally {
    await stackLock.release();
  }
  if (destroy.status !== 0) {
    console.error(
      `\n${warningMark} pulumi destroy exited ${destroy.status}. Common causes: protected resources (lift 'protect' in code for a real teardown), ` +
        'or missing write permissions on the supplied key. Re-running teardown is safe.',
    );
    return false;
  }
  console.info(`${checkMark} Stack resources destroyed.`);

  // Remove the stack from the backend once empty; state history remains in the versioned state bucket.
  const rmStack = spawnSync('pulumi', ['stack', 'rm', '--yes', '--stack', targetStack], { cwd: infraDir, env, stdio: 'inherit' });
  if (rmStack.status === 0) console.info(`${checkMark} Pulumi stack '${targetStack}' removed from the backend.`);

  console.info(
    `\n${pc.dim('Not touched (by design): the Pulumi state bucket (versioned history), Secret Manager containers with operator values.')}\n`,
  );
  return true;
}

/** Delete the stack's identities: the per-mode group's applications with their keys and policies, then the group. The app's operator is not in it. */
async function deleteIdentities(context: InfraContext, ownerKey: OwnerKey): Promise<void> {
  const { appConfig } = context;
  const mode = context.environment;
  const confirmToken = `${appConfig.slug}-${mode}`;
  const { accessKey, secretKey, organizationId } = ownerKey;
  try {
    const { applications } = await listManagedPrincipals({ callerSecretKey: secretKey, organizationId, slug: appConfig.slug, mode });
    if (applications.length === 0) {
      console.info(`${tildeMark} No engine-managed IAM applications found.`);
    }
    // A run under the operator key must not delete its own application: the key dies with it, and every call after that fails.
    const self = await describeKey({ accessKey, secretKey }).catch(() => undefined);
    const { own, others } = splitOwnApplication(applications, self?.bearer === 'application' ? self.bearerId : undefined);
    for (const app of others) {
      await deleteApplicationCascade({ callerSecretKey: secretKey, organizationId, applicationId: app.id });
      console.info(`  ${tildeMark} Deleted ${app.name}`);
    }
    if (own) {
      console.warn(
        `${warningMark} Kept '${own.name}' and group ${confirmToken}: this run authenticates as that application. Delete both in the console, or run teardown once more with your Owner API key.`,
      );
      return;
    }
    await deleteGroup({ callerSecretKey: secretKey, organizationId, slug: appConfig.slug, mode });
    await removeBootstrapDnsGrant({ callerSecretKey: secretKey, organizationId, slug: appConfig.slug }).catch(() => false);
    console.info(`${checkMark} IAM cleanup complete.`);
  } catch (error) {
    console.warn(
      `${warningMark} IAM cleanup incomplete: ${errorMessage(error)}. The remainder can be deleted in the console (group ${confirmToken}).`,
    );
  }
}
