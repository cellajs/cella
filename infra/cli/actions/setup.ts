import { spawnSync } from 'node:child_process';
import { confirm, select } from '@inquirer/prompts';
import { syncGithubEnvironment } from '../../lib/github-sync';
import { deriveInfra } from '../../lib/naming';
import { actionCommand, actionLabel } from '../../lib/operator-actions';
import { operatorManagedRuntimeSecrets } from '../../lib/runtime-secrets';
import { ensureDnsZone } from '../../lib/scaleway/ensure-dns-zone';
import { deleteApiKey } from '../../lib/scaleway/iam-client';
import { machinePolicies } from '../../lib/scaleway/machine-policies';
import { type KeyPair, organizationIdOfKey } from '../../lib/scaleway/operator-identity';
import { type PrincipalNames, principalNames } from '../../lib/scaleway/principals';
import { buildProviderEnv } from '../../lib/scaleway/provider-env';
import { stateKeyOf } from '../../lib/scaleway/s3-client';
import { createProject, listProjects } from '../../lib/scaleway/scaleway-account';
import { createSecretManagerClient } from '../../lib/scaleway/scaleway-secret-manager';
import { secretManagerPath } from '../../lib/scaleway/secret-paths';
import { type Environment, inFirstProvisioning } from '../../lib/stack/bootstrap-stack-state';
import { controlActor, makeControlClient, stateBucket } from '../../lib/stack/control-store';
import { operatorSecretImports } from '../../lib/stack/operator-secret-imports';
import { projectChoices, projectsOfOtherModes } from '../../lib/stack/project-per-mode';
import { runPulumiUpWithHint } from '../../lib/stack/pulumi-up';
import { changeMark, checkMark, DIVIDER, pc, warningMark, withSpinner } from '../../lib/utils/cli-output';
import { writeModeEnvValues } from '../../lib/utils/env-files';
import { errorMessage } from '../../lib/utils/errors';
import { infraDir } from '../../lib/utils/paths';
import { ensureDatabaseForStack } from '../../tasks/ensure-database';
import { ensureSecrets } from '../../tasks/ensure-secrets';
import { ensureMachineIdentities } from '../../tasks/machine-identities';
import { planMachineKeys, writeMachineKeys } from '../../tasks/machine-keys';
import { writeMachinePolicies } from '../../tasks/machine-policies';
import { storeCustodiedPassphrase } from '../../tasks/passphrase-custody';
import { recordRotation } from '../../tasks/record-rotation';
import { seedOperatorSecrets } from '../../tasks/seed-operator-secrets';
import { setupCiKey } from '../../tasks/setup-ci-key';
import { maskedSecret } from '../prompts/masked-secret';
import { rememberOperatorKey } from '../session';
import type { CliMode, InfraContext } from '../shared';
import {
  acquireStackLockOrExit,
  autoAcceptDefaults,
  confirmOrDefault,
  createStepRunner,
  endAction,
  endActionWithHint,
  endsAction,
  inputOrDefault,
  keyPairOrPrompt,
  pulumiLoginUrl,
  resolveOrCreatePassphrase,
  stackNameFor,
} from '../shared';
import { ensureObserverForEnvironment } from './observer-key';
import { admitOperatorOrExit } from './operator-apply';
import { ensureOperatorForEnvironment } from './operator-key';
import { acquireOperatorKey, type OperatorKey } from './operator-unlock';
import { OWNER_KEY_HINT, type OwnerKey } from './owner-key';

type SetupMode = Extract<CliMode, 'resume' | 'rotate-keys'>;

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

/** Result of the CI-deploy-key phase; empty strings when nothing was minted. */
interface CiKeyResult {
  accessKey: string;
  secretKey: string;
  organizationId: string;
}

/** What an Owner moment hands to the operator part of the same run. */
interface OwnerMomentResult {
  projectId: string;
  ciKey: CiKeyResult;
  /** The operator key, when this moment created the app's operator: the operator part runs on it without asking. */
  operatorKey?: KeyPair;
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

/** Mint (or rotate) the CI deploy key, retrying on operator confirm. */
async function mintCiKey(
  ownerSecretKey: string,
  opts: { projectId: string; organizationId: string; appConfig: InfraContext['appConfig']; mode: string },
): Promise<CiKeyResult> {
  while (true) {
    try {
      const key = await setupCiKey({
        callerSecretKey: ownerSecretKey,
        organizationId: opts.organizationId,
        projectId: opts.projectId,
        slug: opts.appConfig.slug,
        mode: opts.mode,
      });
      return { accessKey: key.accessKey, secretKey: key.secretKey, organizationId: key.organizationId };
    } catch (error) {
      console.error(`\n${warningMark} CI key setup failed: ${errorMessage(error)}`);
      if (!(await confirm({ message: 'Retry?', default: true }))) return { accessKey: '', secretKey: '', organizationId: '' };
    }
  }
}

function printSummary(opts: { rotated: boolean; ciAccessKey: string; names: PrincipalNames }): void {
  const { ciAccessKey, names } = opts;
  const divider = pc.dim(DIVIDER);
  console.info(`\n${divider}`);
  if (ciAccessKey) {
    console.info(
      `${checkMark} ${pc.bold(pc.greenBright(opts.rotated ? 'Keys rotated.' : 'Identities written.'))} CI deploy key ('${names.ciDeploy}'): ${pc.cyanBright(ciAccessKey)}`,
    );
  } else {
    console.info(`${warningMark} ${pc.bold(pc.yellowBright('Done, but CI key was not created.'))} Run ${pc.cyan(actionCommand('rotate-keys'))}.`);
  }
  console.info(divider);
}

/** Offer to revoke the Owner API key typed for this moment: the last call that needs it. */
async function offerOwnerKeyRevoke(pair: KeyPair): Promise<void> {
  const revokeNow = autoAcceptDefaults()
    ? true
    : await confirm({
        message: `Revoke the Owner API key you pasted (${pair.accessKey}) now? Nothing else needs it: the rest runs on the operator key.`,
        default: true,
      });
  if (!revokeNow) {
    console.info(
      `\n${pc.dim('Reminder:')} revoke the Owner API key you pasted (${pair.accessKey}) if it was created for this setup: console → IAM → API keys.`,
    );
    return;
  }
  try {
    await withSpinner('Revoking the Owner API key', () => deleteApiKey({ secretKey: pair.secretKey }, pair.accessKey));
    console.info(`${checkMark} Key ${pair.accessKey} revoked.`);
  } catch (error) {
    console.warn(
      `${warningMark} Could not revoke the key (${errorMessage(error)}). Delete it in the console: ${pc.underline('https://console.scaleway.com/iam/api-keys')}`,
    );
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
    console.info(`${pc.dim('  the first provisioning runs on the operator key (the CI key is read-only on VPC/PN/RDB and cannot create them)')}`);
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
 * Pick or create this environment's Scaleway project when it has none yet, using the Owner API key. Every environment has a project of its own:
 * the project of another environment is listed and cannot be taken. The chosen id is written to infra/.env.<mode> as SCW_PROJECT_ID.
 */
async function ensureProjectId(opts: { slug: string; mode: Environment; accessKey: string; secretKey: string }): Promise<string> {
  console.info(`\n→ Scaleway project for ${opts.mode} ${pc.dim('(none configured yet)')}`);
  const { organizationId, projects } = await withSpinner('Loading Scaleway projects', async () => {
    const organizationId = await organizationIdOfKey({ accessKey: opts.accessKey, secretKey: opts.secretKey });
    return { organizationId, projects: await listProjects(opts.secretKey, organizationId) };
  });
  const CREATE = '__create__';
  const offered = projectChoices(projects, opts.slug, projectsOfOtherModes(opts.mode), CREATE);
  const choice = await select<string>({
    message: `Scaleway project for ${opts.mode}`,
    default: offered.default,
    loop: false,
    choices: offered.choices,
  });
  let projectId = choice;
  if (choice === CREATE) {
    const name = await inputOrDefault({ message: 'New project name', default: opts.slug });
    const project = await createProject(opts.secretKey, { organizationId, name, description: 'Created by the infra CLI setup wizard' });
    console.info(`  ${changeMark} Created project ${project.name} (${project.id})`);
    projectId = project.id;
  }
  writeModeEnvValues(opts.mode, { SCW_PROJECT_ID: projectId });
  process.env.SCW_PROJECT_ID = projectId;
  console.info(`  ${checkMark} SCW_PROJECT_ID written to infra/.env.${opts.mode}`);
  return projectId;
}

/**
 * Offer to run the first deploy here, so a fresh setup ends with a live app.
 * Runs the same one-command deploy CI runs, whose builder machine builds the release, authenticated with the freshly minted CI deploy key so it also proves the CI key path.
 * Skipped when docker or a git HEAD is unavailable.
 */
async function offerFirstDeploy(ctx: SetupContext, ciKey: CiKeyResult, operatorSecrets: OperatorSecretValues): Promise<void> {
  const mode = ctx.context.environment;
  const manualCmd = (sha: string) => `pnpm --filter infra run deploy --mode ${mode} --sha ${sha}`;
  if (spawnSync('docker', ['buildx', 'version'], { stdio: 'ignore' }).status !== 0) {
    console.info(`\n${pc.dim('docker (with buildx) not found; skipping the first deploy. Run it later:')} ${pc.cyan(manualCmd('<git-sha>'))}`);
    return;
  }
  const sha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: infraDir, encoding: 'utf8' }).stdout?.trim();
  if (!sha) {
    console.info(`\n${pc.dim('Could not resolve git HEAD; skipping the first deploy. Run it later:')} ${pc.cyan(manualCmd('<git-sha>'))}`);
    return;
  }
  const hasAdminEmail = !!operatorSecrets.adminEmail;
  if (!hasAdminEmail) {
    console.warn(
      `  ${warningMark} No admin email is set, and the deploy preflight requires the ${pc.bold('admin-email')} runtime secret.\n` +
        `    Set it first via "Manage runtime secrets", or the deploy will fail before rolling anything.`,
    );
  }
  const deployNow = autoAcceptDefaults()
    ? hasAdminEmail
    : await confirm({
        message: `Deploy ${sha.slice(0, 7)} to ${mode} now? A builder machine builds the release, then it rolls out (10-20 min).`,
        default: hasAdminEmail,
      });
  if (!deployNow) {
    console.info(`  ${pc.dim('Deploy later from CI (publish a release / run the Deploy workflow) or locally:')} ${pc.cyan(manualCmd(sha))}`);
    // CI reads the committed stack file, whose encryption salt the setup just wrote: without it the passphrase is "incorrect".
    console.info(
      `  ${pc.bold('Before a CI deploy')}: commit and push ${pc.cyan(`infra/Pulumi.${mode}.yaml`)} (its encryption salt and bootstrap marker are new).`,
    );
    return;
  }
  // The exact env the GitHub Environment holds: the CI deploy key as both the provider key and the state-backend key, plus the passphrase and project ids from childEnv.
  const deployEnv: NodeJS.ProcessEnv = {
    ...ctx.childEnv,
    SCW_ACCESS_KEY: ciKey.accessKey,
    SCW_SECRET_KEY: ciKey.secretKey,
    AWS_ACCESS_KEY_ID: ciKey.accessKey,
    AWS_SECRET_ACCESS_KEY: ciKey.secretKey,
    ...(ciKey.organizationId ? { SCW_DEFAULT_ORGANIZATION_ID: ciKey.organizationId } : {}),
  };
  const { status } = spawnSync('pnpm', ['run', 'deploy', '--mode', mode, '--sha', sha], {
    cwd: infraDir,
    env: deployEnv,
    stdio: 'inherit',
  });
  if (status === 0) {
    const { serviceEndpoints } = await import('../../lib/services');
    const frontendUrl = serviceEndpoints(ctx.appConfig).find((endpoint) => endpoint.slug === 'frontend')?.url;
    const liveUrl = frontendUrl ? ` ${pc.underline(pc.cyanBright(frontendUrl))}` : '';
    console.info(`\n${checkMark} ${pc.bold(pc.greenBright('App is live.'))}${liveUrl}`);
    if (hasAdminEmail) console.info(`  ${pc.dim('Sign in by requesting a magic link for the admin email you provided.')}`);
  } else {
    console.warn(
      `\n${warningMark} First deploy failed (exit ${status}). Boot diagnostics were collected; inspect with ${pc.cyan('pnpm --filter infra diag')}.\n` +
        `  Re-running the same deploy is safe (generations are content-addressed): ${pc.cyan(manualCmd(sha))}`,
    );
  }
}

/**
 * The Owner moment of a setup: the project and every identity, written with an Owner API key typed at the prompt, and nothing else runs on it
 * (no Pulumi, no state, no value of the app's). The machine identities with their policies and standing keys (in the deploy folder), the CI
 * deploy key (synced to GitHub), and the app's operator and observer: created when the app has none, else given this environment's project
 * in place; the observer's key goes to this machine's env files. A rotation replaces every key. Undefined when declined.
 */
async function runOwnerMoment(context: InfraContext, mode: SetupMode): Promise<OwnerMomentResult | undefined> {
  const { appConfig } = context;
  const environment = context.environment;
  const names = principalNames(appConfig.slug, environment);
  console.info(
    pc.dim(`\n→ Owner moment for ${environment}: the project and the identities, written with your Owner API key. Nothing else runs on it.`),
  );
  const pair = await keyPairOrPrompt(undefined, 'Scaleway Owner API key', OWNER_KEY_HINT);
  const projectId = context.projectId || (await ensureProjectId({ slug: appConfig.slug, mode: environment, ...pair }));
  const organizationId = await organizationIdOfKey(pair, projectId);
  const proceedWith = mode === 'rotate-keys' ? actionLabel('rotate-keys') : `the identities of ${environment}`;
  if (!(await confirmOrDefault({ message: `Proceed with ${proceedWith}?`, default: true }))) return undefined;

  console.info('\n→ Machine identities (one application per registry service, and the boot fetcher, each with a standing key)');
  try {
    const registry = { slug: appConfig.slug, mode: environment };
    await ensureMachineIdentities({ ...registry, callerSecretKey: pair.secretKey, projectId, organizationId });
    console.info('\n→ Machine policies');
    await writeMachinePolicies({ secretKey: pair.secretKey }, organizationId, machinePolicies(appConfig, projectId));
    // The standing keys go to the deploy folder, which a deploy hands over from; a rotation makes every one anew.
    console.info('\n→ Standing machine keys');
    const auth = { secretKey: pair.secretKey };
    const secrets = createSecretManagerClient({ secretKey: pair.secretKey, region: appConfig.s3.region, projectId });
    const planned = await planMachineKeys({ auth, secrets, organizationId, ...registry });
    const steps = mode === 'rotate-keys' ? planned.map((step) => ({ ...step, change: 'make' as const })) : planned;
    await writeMachineKeys({ auth, secrets, organizationId, projectId, ...registry, steps });
  } catch (error) {
    console.warn(`${warningMark} Machine identities incomplete: ${errorMessage(error)}. Run \`${actionCommand('identity')}\`.`);
  }

  console.info('\n→ CI deploy key');
  const ciKey = await mintCiKey(pair.secretKey, { projectId, organizationId, appConfig, mode: environment });
  console.info('\n→ Operator');
  const ownerKey: OwnerKey = { ...pair, organizationId, minted: false, release: async () => {} };
  const operatorKey = await ensureOperatorForEnvironment({ ...context, projectId }, ownerKey, projectId);

  // The observer takes the operator's address list, so it follows the operator.
  console.info('\n→ Observer');
  await ensureObserverForEnvironment({ ...context, projectId }, ownerKey, projectId, { rotate: mode === 'rotate-keys' }).catch((error) =>
    console.warn(`${warningMark} Observer incomplete: ${errorMessage(error)}. Run \`${actionCommand('identity')}\`.`),
  );

  // GitHub holds the CI deploy key now; the passphrase follows from the operator part, which makes it.
  if (ciKey.accessKey) {
    const synced = await syncGithubEnvironment({
      repoRoot: new URL('..', `file://${infraDir}/`).pathname,
      environment,
      ciKey: { accessKey: ciKey.accessKey, secretKey: ciKey.secretKey, projectId, organizationId: ciKey.organizationId },
    });
    if (!synced) {
      console.warn(
        `\n${warningMark} GitHub sync skipped (gh not authenticated or origin is not a GitHub remote). The environment holds: SCW_ACCESS_KEY, SCW_SECRET_KEY, SCW_PROJECT_ID, SCW_ORGANIZATION_ID, PULUMI_CONFIG_PASSPHRASE.`,
      );
    }
  }

  printSummary({ rotated: mode === 'rotate-keys', ciAccessKey: ciKey.accessKey, names });
  // Revoking is the moment's last call: a key may delete itself, and nothing after this needs it.
  await offerOwnerKeyRevoke(pair);
  return { projectId, ciKey, operatorKey };
}

/**
 * The operator part of a setup, on the operator key: the passphrase and its custody, the state bucket and the stack, the first `pulumi up`
 * and the operator's secret values. It writes no IAM.
 */
async function runOperatorPart(context: InfraContext, operatorKey: OperatorKey, moment: OwnerMomentResult | undefined): Promise<void> {
  const { appConfig } = context;
  const environment = context.environment;
  const projectId = moment?.projectId ?? context.projectId;
  const stackName = stackNameFor(context);
  const firstSetup = context.state === 'fresh';

  // After the key: an unlocked session fetches the passphrase, so nobody types it.
  const { passphrase: pulumiPassphrase, generated: passphraseGenerated } = await resolveOrCreatePassphrase(context.stackYaml);
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
  if (!firstSetup) await admitOperatorOrExit(context, { ...operatorKey, passphrase: pulumiPassphrase, stack: stackName });
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

  // The passphrase goes into Secret Manager, so later runs fetch it with the operator key and nobody types it.
  await storeCustodiedPassphrase({
    secretKey: operatorKey.secretKey,
    region: appConfig.s3.region,
    projectId,
    slug: appConfig.slug,
    mode: environment,
    passphrase: pulumiPassphrase,
  }).catch((error) =>
    console.warn(`${warningMark} Could not store the passphrase in Secret Manager (${errorMessage(error)}); it is asked once on the next run.`),
  );

  // Identity ids come from the IAM API, so stack config only needs a non-secret bootstrap marker.
  const ciKey = moment?.ciKey;
  if (context.hasCiKey || ciKey?.accessKey) {
    await must(
      'Mark bootstrap complete',
      'pulumi',
      ['config', 'set', 'infra:bootstrapComplete', new Date().toISOString(), '--stack', stackName],
      spawnSync,
    );
  }

  // The passphrase is verified against the stack above and re-synced every run, which repairs a missing or drifted PULUMI_CONFIG_PASSPHRASE environment secret.
  const synced = await syncGithubEnvironment({
    repoRoot: new URL('..', `file://${infraDir}/`).pathname,
    environment,
    passphrase: pulumiPassphrase,
  });
  if (!synced) {
    console.warn(
      `\n${warningMark} GitHub sync skipped (gh not authenticated or origin is not a GitHub remote).\n` +
        `  Add the Environment secrets manually${passphraseGenerated ? `: including the just-generated ${pc.bold('PULUMI_CONFIG_PASSPHRASE')}` : ''}.`,
    );
  }

  // Base infrastructure provisioning
  console.info(`\n${pc.bold('Next: provision base infrastructure')} (registry, DB, network, no compute yet)`);
  if (!firstSetup) {
    console.info(
      `  ${pc.dim('Recommended: push to the deploy branch and let CI run `pulumi up` (this local run is only needed for out-of-band changes).')}`,
    );
  }
  const runNow = await confirmOrDefault({
    message: firstSetup ? 'Run the recommended first pulumi up now?' : 'Run pulumi up now?',
    default: firstSetup,
  });
  if (!runNow) {
    console.info(`  ${pc.dim(`Recommended: run \`${actionCommand('resume')}\` to retry.`)}`);
    return;
  }
  await provisionBaseInfra(ctx, operatorSecrets);
  // Only a first setup still holds the CI key secret in memory; rotate and resume leave deploys to CI.
  if (firstSetup && ciKey?.secretKey) await offerFirstDeploy(ctx, ciKey, operatorSecrets);
}

/** Record a rotation of keys in the control object, under the stack lock, with the operator key. */
async function recordKeyRotation(context: InfraContext, operatorKey: OperatorKey): Promise<void> {
  const { appConfig, projectId } = context;
  const stack = stackNameFor(context);
  const state = stateKeyOf(operatorKey, projectId);
  const lock = await acquireStackLockOrExit({ appConfig, ...state, stack, operation: 'rotate-keys' });
  try {
    const s3 = await makeControlClient(appConfig.s3.region, state.accessKey, state.secretKey);
    const rotations = await recordRotation({ s3, bucket: stateBucket(appConfig.slug), stack, kind: 'keys', by: controlActor() });
    console.info(
      `${checkMark} Rotation ${rotations.counter} recorded. ${pc.bold('Deploy now')}: every machine is replaced with the new machine keys.`,
    );
  } finally {
    await lock.release();
  }
}

/**
 * Set up, resume or rotate a stack. A run that makes or replaces identities (a first setup, a setup that never minted its CI key, a key
 * rotation) starts with an Owner moment: the project and the identities, written with an Owner API key typed at the prompt. Everything else
 * (state, stack, passphrase, the first `pulumi up`, secret values) runs on the operator key, which writes no IAM. A rotation ends after its
 * Owner moment; a resume that only re-syncs needs no Owner key.
 */
export async function runSetup(context: InfraContext, mode: SetupMode): Promise<void> {
  const writesIdentities = mode === 'rotate-keys' || !context.hasCiKey;
  const moment = writesIdentities ? await runOwnerMoment(context, mode) : undefined;
  if (writesIdentities && !moment) return;
  // An operator the moment just created is in memory: the session asks for nothing.
  if (moment?.operatorKey) rememberOperatorKey(moment.operatorKey);
  const operatorKey = await acquireOperatorKey(context);
  // An Owner key never writes the state: the rotation is recorded with the operator key, and its counter makes the next deploy replace
  // every machine, so none keeps a key the rotation deleted.
  if (mode === 'rotate-keys') await recordKeyRotation(context, operatorKey);
  else await runOperatorPart(context, operatorKey, moment);
}
