import { spawnSync } from 'node:child_process';
import { confirm, input } from '@inquirer/prompts';
import { buildProviderEnv } from '../../lib/scaleway/bootstrap-scw-env';
import {
  deleteApplicationCascade,
  deleteGroup,
  listManagedPrincipals,
  removeBootstrapDnsGrant,
  resolveOrganizationId,
} from '../../lib/scaleway/scaleway-iam';
import { checkMark, pc, tildeMark, warningMark } from '../../lib/utils/cli-output';
import { errorMessage } from '../../lib/utils/errors';
import { infraDir } from '../../lib/utils/paths';
import { maskedSecret } from '../prompts/masked-secret';
import {
  acquireStackLockOrExit,
  envOr,
  type InfraContext,
  promptRequiredInput,
  promptStackName,
  pulumiLoginAndSelect,
  resolveVerifiedPassphrase,
} from '../shared';

/**
 * First-class environment teardown. Owns the whole ritual that would otherwise
 * be hand-reproduced (state-backend login, AWS_*↔SCW_* mapping, stack
 * selection, `destroy --refresh`), then offers IAM principal cleanup.
 *
 * Credentials: two halves with different requirements, named explicitly.
 *  - infra destroy: the ADMIN key covers the state backend, but destroying
 *    compute/LB/VPC needs write access the admin deliberately lacks, so the
 *    destroy phase asks for a bootstrap-grade key (IAMManager not required,
 *    but full project write).
 *  - IAM cleanup: needs IAMManager; same bootstrap key when it has it.
 *
 * Production stacks additionally require typing `<slug>-production` and carry
 * `protect: true` on the frontend/private buckets. Pulumi refuses those
 * unless protection is lifted in code first, which is deliberate.
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
      `${warningMark} ${pc.bold('This is PRODUCTION.')} Protected resources (frontend/private buckets, DB) will refuse destruction unless 'protect' is lifted in code — that refusal is deliberate.`,
    );
  }

  const typed = await input({ message: `Type ${pc.bold(confirmToken)} to continue` });
  if (typed.trim() !== confirmToken) {
    console.info('Token mismatch; nothing was touched.');
    return;
  }

  // Named credential pair for the destroy phase. SCW_TEARDOWN_* env vars allow
  // unattended runs; interactive runs are told exactly which key quality is
  // needed, with no guessing among SCW_*/AWS_* variables.
  console.info(
    `\n${pc.dim('Credentials: a key with FULL PROJECT WRITE (a bootstrap key works; the admin key cannot destroy compute/VPC/DB).')}\n` +
      `${pc.dim(`Reads env ${pc.bold('SCW_TEARDOWN_ACCESS_KEY')}/${pc.bold('SCW_TEARDOWN_SECRET_KEY')} first, then prompts.`)}`,
  );
  const accessKey = await envOr(['SCW_TEARDOWN_ACCESS_KEY', 'SCW_BOOTSTRAP_ACCESS_KEY'], () =>
    promptRequiredInput('Scaleway teardown access key'),
  );
  const secretKey = await envOr(['SCW_TEARDOWN_SECRET_KEY', 'SCW_BOOTSTRAP_SECRET_KEY'], () =>
    maskedSecret({ message: 'Scaleway teardown secret key' }),
  );
  const passphrase = await resolveVerifiedPassphrase(context.stackYaml);
  const targetStack = await promptStackName(context);

  const env = buildProviderEnv(infraDir, { accessKey, secretKey, projectId: context.projectId, passphrase });
  let organizationId: string | undefined;
  try {
    organizationId = await resolveOrganizationId(secretKey, context.projectId);
    env.SCW_DEFAULT_ORGANIZATION_ID = organizationId;
  } catch (error) {
    console.warn(
      `${warningMark} Could not resolve organization id (${errorMessage(error)}); IAM cleanup will be skipped.`,
    );
  }

  pulumiLoginAndSelect(infraDir, env, appConfig, targetStack);

  const stackLock = await acquireStackLockOrExit({
    appConfig,
    accessKey,
    secretKey,
    stack: targetStack,
    operation: 'teardown',
  });

  // --refresh first so the destroy plan matches live state (a stale local view
  // of generations/LB must not orphan real resources).
  console.info(pc.dim('\n→ pulumi destroy --refresh (this may take several minutes)…'));
  const destroy = spawnSync('pulumi', ['destroy', '--refresh', '--yes', '--stack', targetStack], {
    cwd: infraDir,
    env,
    stdio: 'inherit',
  });
  await stackLock.release();
  if (destroy.status !== 0) {
    console.error(
      `\n${warningMark} pulumi destroy exited ${destroy.status}. Common causes: protected resources (lift 'protect' in code for a real teardown), ` +
        'or missing write permissions on the supplied key. Re-running teardown is safe.',
    );
    return;
  }
  console.info(`${checkMark} Stack resources destroyed.`);

  // Remove the stack from the backend once empty (state history remains in the
  // versioned state bucket).
  const rmStack = spawnSync('pulumi', ['stack', 'rm', '--yes', '--stack', targetStack], {
    cwd: infraDir,
    env,
    stdio: 'inherit',
  });
  if (rmStack.status === 0) console.info(`${checkMark} Pulumi stack '${targetStack}' removed from the backend.`);

  // IAM principal cleanup: group members + legacy-named apps + the org-wide
  // bootstrap DNS residue. Enumerated via the per-mode group (REQ-1), never by
  // name-guessing alone. Requires IAMManager + IAMReadOnly on the same key.
  if (!organizationId) return;
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
