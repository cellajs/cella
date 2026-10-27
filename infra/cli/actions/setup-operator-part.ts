import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { confirm } from '@inquirer/prompts';
import { storeDeployKeyCopy } from '../../lib/deploy/main-job';
import { deriveInfra } from '../../lib/naming';
import { actionCommand, actionLabel } from '../../lib/operator-actions';
import { operatorManagedRuntimeSecrets } from '../../lib/runtime-secrets';
import { ensureDnsZone } from '../../lib/scaleway/ensure-dns-zone';
import type { KeyPair } from '../../lib/scaleway/operator-identity';
import { buildProviderEnv } from '../../lib/scaleway/provider-env';
import { stateKeyOf } from '../../lib/scaleway/s3-client';
import { createSecretManagerClient } from '../../lib/scaleway/scaleway-secret-manager';
import { secretManagerPath } from '../../lib/scaleway/secret-paths';
import { inFirstProvisioning } from '../../lib/stack/bootstrap-stack-state';
import { controlActor, makeControlClient, stateBucket } from '../../lib/stack/control-store';
import { operatorSecretImports } from '../../lib/stack/operator-secret-imports';
import { runPulumiUpWithHint } from '../../lib/stack/pulumi-up';
import { checkMark, pc, warningMark } from '../../lib/utils/cli-output';
import { errorMessage } from '../../lib/utils/errors';
import { infraDir } from '../../lib/utils/paths';
import { ensureDatabaseForStack } from '../../tasks/ensure-database';
import { ensureSecrets } from '../../tasks/ensure-secrets';
import { storeCustodiedPassphrase } from '../../tasks/passphrase-custody';
import { recordRotation } from '../../tasks/record-rotation';
import { seedOperatorSecrets } from '../../tasks/seed-operator-secrets';
import { maskedSecret } from '../prompts/masked-secret';
import type { InfraContext } from '../shared';
import {
  acquireStackLockOrExit,
  confirmOrDefault,
  createStepRunner,
  endAction,
  endActionWithHint,
  endsAction,
  inputOrDefault,
  pulumiLoginUrl,
  resolveOrCreatePassphrase,
  stackNameFor,
} from '../shared';
import { admitOperatorOrExit } from './operator-apply';
import type { OperatorKey } from './operator-unlock';
import type { OwnerMomentResult } from './setup-owner-moment';

/** An optional masked value: empty when the prompt cannot run (no terminal), while a Ctrl-C at it still leaves the wizard. */
async function optionalSecret(message: string): Promise<string> {
  try {
    return await maskedSecret({ message });
  } catch (error) {
    if (endsAction(error)) throw error;
    return '';
  }
}

/** What the operator part of a setup shares. */
interface SetupContext {
  context: InfraContext;
  appConfig: InfraContext['appConfig'];
  projectId: string;
  /** The operator key: provider auth, Secret Manager writes and IAM reads. */
  accessKey: string;
  secretKey: string;
  /** The key for the state side (backend login, stack lock): the operator key, naming this project. */
  stateKey: KeyPair;
  stackName: string;
  /** Secret Manager folder for this stack's runtime secrets. */
  runtimeSecretPath: string;
  /** Child-process env carrying the provider key + passphrase. */
  childEnv: NodeJS.ProcessEnv;
  must: ReturnType<typeof createStepRunner>['must'];
}

/** Optional operator secret values gathered at the first-setup prompts, seeded once the first `pulumi up` made their containers. */
interface OperatorSecretValues {
  adminEmail: string;
  brevoApiKey: string;
}

/** Read-only warning about required operator-managed runtime secrets with no value. Non-fatal: the first `pulumi up` creates the containers. */
async function warnOnMissingOperatorSecrets(ctx: SetupContext): Promise<void> {
  try {
    const client = createSecretManagerClient({ secretKey: ctx.secretKey, region: ctx.appConfig.s3.region, projectId: ctx.projectId });
    const existing = await client.listSecretsUnder(ctx.runtimeSecretPath);
    const versioned = new Set(existing.filter((secret) => (secret.version_count ?? 0) > 0).map((secret) => secret.name));
    const missing = operatorManagedRuntimeSecrets.filter((secret) => secret.required && !versioned.has(secret.secretName));
    if (missing.length > 0) {
      const services = [...new Set(missing.flatMap((secret) => secret.services))].join(', ');
      console.warn(
        `  ${warningMark} Required runtime secret(s) not set yet: ${missing.map((secret) => secret.secretName).join(', ')}. ` +
          `Use "Manage runtime secrets" before deploying ${services}.`,
      );
    }
  } catch {
    // Secret Manager unreachable (e.g. fresh project): skip the gap check.
  }
}

/**
 * Validate DNS, lock the stack, defer fresh compute, and converge Pulumi, on the operator key.
 * Once secret containers exist, seed the operator's values.
 */
async function provisionBaseInfra(ctx: SetupContext, operatorSecrets: OperatorSecretValues): Promise<void> {
  const { dnsZone, hasDomain } = deriveInfra(ctx.appConfig);
  if (hasDomain) {
    try {
      await ensureDnsZone({ secretKey: ctx.secretKey, projectId: ctx.projectId, domain: dnsZone });
    } catch (error) {
      if (endsAction(error)) throw error;
      console.error(`\n${warningMark} DNS zone check failed: ${errorMessage(error)}`);
      if (!(await confirmOrDefault({ message: 'Continue with pulumi up anyway?', default: false }))) endAction(1);
    }
  }

  // Lock provisioning against concurrent operators and CI; every exit path releases it, and abandoned locks expire or clear with "Unlock stack".
  const stackLock = await acquireStackLockOrExit({
    appConfig: ctx.appConfig,
    accessKey: ctx.stateKey.accessKey,
    secretKey: ctx.stateKey.secretKey,
    stack: ctx.stackName,
    operation: 'setup',
  });

  const firstProvision = ctx.context.state === 'fresh';
  // Until the first provisioning completes, the stack keeps compute deferred; a resume after a failed one is still that first provisioning.
  const firstProvisioning = inFirstProvisioning(ctx.context);
  if (firstProvisioning) {
    // A teardown keeps the operator-value containers with their values: the first `up` of the same environment adopts them.
    const listed = await createSecretManagerClient({ secretKey: ctx.secretKey, region: ctx.appConfig.s3.region, projectId: ctx.projectId })
      .listSecretsUnder(ctx.runtimeSecretPath)
      .catch(() => []);
    const imports = operatorSecretImports(listed, operatorManagedRuntimeSecrets, {
      slug: ctx.appConfig.slug,
      mode: ctx.context.environment,
      region: ctx.appConfig.s3.region,
    });
    if (imports) {
      ctx.childEnv.OPERATOR_SECRET_IMPORTS = imports;
      console.info(
        `  ${checkMark} Adopting the operator values a teardown kept: ${imports
          .split(',')
          .map((entry) => entry.split('=')[0])
          .join(', ')}`,
      );
    }
  }
  if (firstProvision) {
    console.info(
      `${pc.dim('  the first provisioning runs on the operator key (the deploy key is read-only on the VPC and the database and cannot create them)')}`,
    );
    // Fresh provision: no images exist yet, so compute is deferred until CI pushes them (helpers gate on this marker).
    const startedAt = new Date().toISOString();
    spawnSync('pulumi', ['config', 'set', 'bootstrap:computeDeferred', startedAt, '--stack', ctx.stackName], {
      cwd: infraDir,
      env: ctx.childEnv,
      stdio: 'inherit',
    });
  }

  // The Scaleway provider authenticates from SCW_* env (childEnv), which carries the operator key.
  while (true) {
    const { code } = await runPulumiUpWithHint(ctx.stackName, infraDir, ctx.childEnv);
    if (code === 0) break;
    if (!(await confirm({ message: 'Retry?', default: true }))) {
      await stackLock.release();
      endActionWithHint(
        `Base provisioning failed (pulumi up exited ${code})`,
        { command: actionCommand('resume'), description: 'fix the cause above, then run it again to continue' },
        code ?? 1,
      );
    }
  }
  if (firstProvisioning) {
    spawnSync('pulumi', ['config', 'rm', 'bootstrap:computeDeferred', '--stack', ctx.stackName], {
      cwd: infraDir,
      env: ctx.childEnv,
      stdio: 'ignore',
    });
  }
  console.info(`\n${checkMark} Base infrastructure provisioned (no compute yet). The next deploy, local or CI, brings the VMs up.`);

  // The database roles and connection strings, and the generated values, are made outside the state once the `up` made their containers.
  await ensureDatabaseForStack({
    env: ctx.childEnv,
    stack: ctx.stackName,
    slug: ctx.appConfig.slug,
    mode: ctx.context.environment,
    region: ctx.appConfig.s3.region,
    projectId: ctx.projectId,
    secretKey: ctx.secretKey,
  });
  const secrets = createSecretManagerClient({ secretKey: ctx.secretKey, region: ctx.appConfig.s3.region, projectId: ctx.projectId });
  await ensureSecrets({ client: secrets, slug: ctx.appConfig.slug, mode: ctx.context.environment });

  // Seed prompted values only after Pulumi creates the empty secret containers; skipped values stay available through "Manage runtime secrets".
  await seedOperatorSecrets({
    secretKey: ctx.secretKey,
    projectId: ctx.projectId,
    region: ctx.appConfig.s3.region,
    slug: ctx.appConfig.slug,
    mode: ctx.context.environment,
    values: { adminEmail: operatorSecrets.adminEmail || undefined, brevoApiKey: operatorSecrets.brevoApiKey || undefined },
  });

  await stackLock.release();
}

/**
 * The operator part of a setup, on the operator key: the passphrase and its custody, the state bucket and the stack, the first `pulumi up`
 * and the operator's secret values. It writes no IAM.
 */
export async function runOperatorPart(context: InfraContext, operatorKey: OperatorKey, moment: OwnerMomentResult | undefined): Promise<void> {
  const { appConfig } = context;
  const environment = context.environment;
  const projectId = moment?.projectId ?? context.projectId;
  const stackName = stackNameFor(context);
  const firstSetup = context.state === 'fresh';

  // After the key: an unlocked session fetches the passphrase, so nobody types it.
  const { passphrase: pulumiPassphrase } = await resolveOrCreatePassphrase(context.stackYaml);
  const operatorSecrets: OperatorSecretValues = { adminEmail: '', brevoApiKey: '' };
  if (firstSetup) {
    operatorSecrets.adminEmail = await inputOrDefault({
      message: 'Admin email (optional, set later via "Manage runtime secrets")',
      envName: 'INFRA_ADMIN_EMAIL',
    });
    operatorSecrets.brevoApiKey = operatorSecrets.adminEmail ? await optionalSecret('Brevo API key (optional)') : '';
  }
  const proceedWith = firstSetup ? `the first setup of ${environment}` : actionLabel('resume');
  if (!(await confirmOrDefault({ message: `Proceed with ${proceedWith}?`, default: true }))) return;

  // The operator key serves the state side too, naming this project, as it is made in one environment's. A stack whose buckets predate the
  // operator lets it in first.
  if (!firstSetup) await admitOperatorOrExit(context, operatorKey);
  const stateKey: KeyPair = stateKeyOf(operatorKey, projectId);
  const childEnv = buildProviderEnv(infraDir, {
    accessKey: operatorKey.accessKey,
    secretKey: operatorKey.secretKey,
    projectId,
    passphrase: pulumiPassphrase,
    organizationId: operatorKey.organizationId,
  });

  const { must } = createStepRunner(infraDir, childEnv);
  const ctx: SetupContext = {
    context,
    appConfig,
    projectId,
    accessKey: operatorKey.accessKey,
    secretKey: operatorKey.secretKey,
    stateKey,
    stackName,
    runtimeSecretPath: secretManagerPath(appConfig.slug, environment),
    childEnv,
    must,
  };

  // State backend + stack
  await must('Ensure Pulumi state bucket', 'pnpm', ['ensure-state-bucket'], spawnSync, { retry: true });
  await must('Pulumi login (S3 backend)', 'pulumi', ['login', pulumiLoginUrl(appConfig)], spawnSync, { retry: true });
  const selected = spawnSync('pulumi', ['stack', 'select', stackName], { cwd: infraDir, env: childEnv, stdio: 'ignore' });
  if (selected.status === 0) {
    console.info(`\n→ Pulumi stack: ${stackName} (exists: selected)`);
  } else {
    await must('Pulumi stack init', 'pulumi', ['stack', 'init', stackName], spawnSync);
  }

  // The pre-apply gap check is read-only; values are seeded after the first `pulumi up` makes their containers.
  if (!operatorSecrets.adminEmail) await warnOnMissingOperatorSecrets(ctx);

  // The passphrase goes into Secret Manager, so later runs fetch it with the operator key and nobody types it; the new stack's salt goes
  // beside it, so the main job can deploy any commit without this stack file.
  const stackFile = resolve(infraDir, `Pulumi.${environment}.yaml`);
  await storeCustodiedPassphrase({
    secretKey: operatorKey.secretKey,
    region: appConfig.s3.region,
    projectId,
    slug: appConfig.slug,
    mode: environment,
    passphrase: pulumiPassphrase,
    stackYaml: existsSync(stackFile) ? readFileSync(stackFile, 'utf8') : undefined,
  }).catch((error) =>
    console.warn(`${warningMark} Could not store the passphrase in Secret Manager (${errorMessage(error)}); it is asked once on the next run.`),
  );

  // Identity ids come from the IAM API, so stack config only needs a non-secret bootstrap marker.
  const ciKey = moment?.ciKey;
  await copyDeployKeyForMainJob(context, operatorKey, projectId, ciKey);
  if (context.hasCiKey || ciKey?.accessKey) {
    await must(
      'Mark bootstrap complete',
      'pulumi',
      ['config', 'set', 'infra:bootstrapComplete', new Date().toISOString(), '--stack', stackName],
      spawnSync,
    );
  }

  // Base infrastructure provisioning
  console.info(`\n${pc.bold('Next: provision base infrastructure')} (registry, DB, network, no compute yet)`);
  const runNow = await confirmOrDefault({
    message: firstSetup ? 'Run the recommended first pulumi up now?' : 'Run pulumi up now?',
    default: firstSetup,
  });
  if (!runNow) {
    console.info(`  ${pc.dim(`Recommended: run \`${actionCommand('resume')}\` to retry.`)}`);
    return;
  }
  await provisionBaseInfra(ctx, operatorSecrets);
  if (firstSetup) {
    console.info(
      `\n${checkMark} ${environment} is provisioned. The first release is deployed like every other: \`${actionCommand('runner-identity')}\` and \`${actionCommand('runner-replace')}\` set up the runner, which starts it, or \`${actionCommand('start-deploy')}\` starts it now.`,
    );
    console.info(`  ${pc.dim(`Commit infra/Pulumi.${environment}.yaml, so other checkouts see the stack set up; deploys do not need it.`)}`);
  }
}

/** Record a rotation of keys in the control object, under the stack lock, with the operator key. */
/**
 * Copy a deploy key the Owner moment made into the engine folder, where the main job's definition references it (plan §3.5). Both a setup
 * and a rotation of keys make one, and a rotation deletes the key the copy held before, so a rotation that skipped this would leave the
 * main job's runs a dead key. The secret key is shown only when the key is made, so a failed copy takes another rotation of keys.
 */
export async function copyDeployKeyForMainJob(
  context: InfraContext,
  operatorKey: OperatorKey,
  projectId: string,
  ciKey: { accessKey: string; secretKey: string } | undefined,
): Promise<void> {
  if (!ciKey?.accessKey || !ciKey.secretKey) return;
  const { appConfig } = context;
  await storeDeployKeyCopy(createSecretManagerClient({ secretKey: operatorKey.secretKey, region: appConfig.s3.region, projectId }), {
    slug: appConfig.slug,
    mode: context.environment,
    key: ciKey,
  }).then(
    () => console.info(`  ${checkMark} The deploy key's copy for the main job is in the engine folder.`),
    (error) =>
      console.warn(
        `${warningMark} Could not copy the deploy key for the main job (${errorMessage(error)}); \`${actionCommand('rotate-keys')}\` makes a new key and copies it.`,
      ),
  );
}

export async function recordKeyRotation(context: InfraContext, operatorKey: OperatorKey): Promise<void> {
  const { appConfig, projectId } = context;
  const stack = stackNameFor(context);
  const state = stateKeyOf(operatorKey, projectId);
  const lock = await acquireStackLockOrExit({ appConfig, ...state, stack, operation: 'rotate-keys' });
  try {
    const s3 = await makeControlClient(appConfig.s3.region, state.accessKey, state.secretKey);
    const rotations = await recordRotation({ s3, bucket: stateBucket(appConfig.slug), stack, kind: 'keys', by: controlActor() });
    console.info(`${checkMark} Rotation ${rotations.counter} recorded: the deploy that follows replaces every machine with the new machine keys.`);
  } finally {
    await lock.release();
  }
}
