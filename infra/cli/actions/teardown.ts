import { spawnSync } from 'node:child_process';
import { confirm, input } from '@inquirer/prompts';
import { buildProviderEnv } from '../../lib/scaleway/bootstrap-scw-env';
import { resolveOperatorIdentity } from '../../lib/scaleway/operator-identity';
import { principalNames } from '../../lib/scaleway/principals';
import {
  deleteApplicationCascade,
  deleteGroup,
  listManagedPrincipals,
  removeBootstrapDnsGrant,
} from '../../lib/scaleway/scaleway-iam';
import { checkMark, pc, tildeMark, warningMark } from '../../lib/utils/cli-output';
import { errorMessage } from '../../lib/utils/errors';
import { infraDir } from '../../lib/utils/paths';
import {
  acquireStackLockOrExit,
  type InfraContext,
  pulumiLoginAndSelect,
  resolveVerifiedPassphrase,
  stackNameFor,
} from '../shared';
import { acquireBootstrapKey } from './bootstrap-key';
import { printRevokeReminder } from './privileged-converge';

/**
 * Destroy an environment: state-backend login, AWS_ and SCW_ env mapping, stack selection, `destroy --refresh`, then optional IAM principal cleanup.
 * The destroy phase needs full project write and the IAM cleanup IAMManager, so it takes a bootstrap key the way Apply does (supplied, minted from
 * SCW_OWNER_*, or prompted; validated first). Production stacks require typing `<slug>-production`, and their frontend/private buckets carry
 * `protect: true`, so Pulumi refuses to delete them until protection is lifted in code.
 */
export async function runTeardown(context: InfraContext): Promise<void> {
  const { appConfig } = context;
  const mode = context.environment;
  const confirmToken = `${appConfig.slug}-${mode}`;

  console.info(`\n${pc.bold(pc.redBright('Teardown'))} ${pc.dim(`(${confirmToken})`)}\n`);
  console.info(
    pc.dim(
      'Destroys every Pulumi-managed resource of this stack (VMs, LB, buckets, DB…), then optionally deletes the IAM principals.',
    ),
  );
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

  const identity = resolveOperatorIdentity();
  const bootstrap = await acquireBootstrapKey({
    identity,
    names: principalNames(appConfig.slug, mode),
    projectId: context.projectId,
    slug: appConfig.slug,
    mode,
  });
  try {
    await destroyStack(context, bootstrap, identity.state);
  } finally {
    await bootstrap.release();
  }
  if (!bootstrap.minted) printRevokeReminder();
}

async function destroyStack(
  context: InfraContext,
  bootstrap: Awaited<ReturnType<typeof acquireBootstrapKey>>,
  state: { accessKey: string; secretKey: string } | undefined,
): Promise<void> {
  const { appConfig } = context;
  const mode = context.environment;
  const confirmToken = `${appConfig.slug}-${mode}`;
  const { accessKey, secretKey, organizationId } = bootstrap;
  const passphrase = await resolveVerifiedPassphrase(context.stackYaml);
  const targetStack = stackNameFor(context);

  // The state bucket admits only the admin and CI deploy applications, so the destroy key drives the provider while the standing key serves the state side, as in Apply.
  const env = buildProviderEnv(infraDir, {
    accessKey,
    secretKey,
    projectId: context.projectId,
    passphrase,
    organizationId,
    stateAccessKey: state?.accessKey,
    stateSecretKey: state?.secretKey,
  });
  pulumiLoginAndSelect(infraDir, env, appConfig, targetStack);

  const stackLock = await acquireStackLockOrExit({
    appConfig,
    accessKey: state?.accessKey ?? accessKey,
    secretKey: state?.secretKey ?? secretKey,
    stack: targetStack,
    operation: 'teardown',
  });

  // --refresh first so the destroy plan matches live state; a stale local view of generations/LB would orphan real resources.
  // The lock releases in a finally so a throw between acquire and release cannot strand it until the TTL.
  let destroy: ReturnType<typeof spawnSync>;
  try {
    console.info(pc.dim('\n→ pulumi destroy --refresh (this may take several minutes)…'));
    destroy = spawnSync('pulumi', ['destroy', '--refresh', '--yes', '--stack', targetStack], {
      cwd: infraDir,
      env,
      stdio: 'inherit',
    });
  } finally {
    await stackLock.release();
  }
  if (destroy.status !== 0) {
    console.error(
      `\n${warningMark} pulumi destroy exited ${destroy.status}. Common causes: protected resources (lift 'protect' in code for a real teardown), ` +
        'or missing write permissions on the supplied key. Re-running teardown is safe.',
    );
    return;
  }
  console.info(`${checkMark} Stack resources destroyed.`);

  // Remove the stack from the backend once empty; state history remains in the versioned state bucket.
  const rmStack = spawnSync('pulumi', ['stack', 'rm', '--yes', '--stack', targetStack], {
    cwd: infraDir,
    env,
    stdio: 'inherit',
  });
  if (rmStack.status === 0) console.info(`${checkMark} Pulumi stack '${targetStack}' removed from the backend.`);

  // IAM principal cleanup: group members plus the org-wide bootstrap DNS residue, enumerated via the per-mode group (REQ-1) and never by name-guessing. Needs IAMManager + IAMReadOnly on the same key.
  const cleanupIam = await confirm({
    message: `Also delete the IAM principals (group ${confirmToken}, its applications, keys, and policies)? Requires IAMManager on this key.`,
    default: mode !== 'production',
  });
  if (!cleanupIam) {
    console.info(pc.dim('IAM principals kept. Re-run teardown later or delete them in the console.'));
    return;
  }
  try {
    const { applications } = await listManagedPrincipals({
      callerSecretKey: secretKey,
      organizationId,
      slug: appConfig.slug,
      mode,
    });
    if (applications.length === 0) {
      console.info(`${tildeMark} No engine-managed IAM applications found.`);
    }
    for (const app of applications) {
      await deleteApplicationCascade({ callerSecretKey: secretKey, organizationId, applicationId: app.id });
      console.info(`  ${tildeMark} Deleted ${app.name}`);
    }
    await deleteGroup({ callerSecretKey: secretKey, organizationId, slug: appConfig.slug, mode });
    await removeBootstrapDnsGrant({ callerSecretKey: secretKey, organizationId, slug: appConfig.slug }).catch(
      () => false,
    );
    console.info(`${checkMark} IAM cleanup complete.`);
  } catch (error) {
    console.warn(
      `${warningMark} IAM cleanup incomplete: ${errorMessage(error)}. The remainder can be deleted in the console (group ${confirmToken}).`,
    );
  }

  console.info(
    `\n${pc.dim('Not touched (by design): the Pulumi state bucket (versioned history), Secret Manager containers with operator values, GitHub Environment secrets.')}\n` +
      `${pc.dim('Remove GitHub secrets with')} ${pc.cyan(`gh secret delete -e ${mode} SCW_ACCESS_KEY`)} ${pc.dim('etc. when the environment is gone for good.')}`,
  );
}
