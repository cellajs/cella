import { spawnSync } from 'node:child_process';
import { confirm, select } from '@inquirer/prompts';
import { syncGithubEnvironment } from '../../lib/github-sync';
import { type ManagedKeyId, managedKeys } from '../../lib/managed-keys';
import { deriveInfra } from '../../lib/naming';
import { actionCommand, actionLabel } from '../../lib/operator-actions';
import { operatorManagedRuntimeSecrets } from '../../lib/runtime-secrets';
import { ensureDnsZone } from '../../lib/scaleway/ensure-dns-zone';
import { deleteApiKey, fetchAppRulesByName } from '../../lib/scaleway/iam-client';
import { type KeyPair, resolveOperatorIdentity } from '../../lib/scaleway/operator-identity';
import { CI_RULE_SHAPES } from '../../lib/scaleway/permissions';
import { type PrincipalNames, principalNames } from '../../lib/scaleway/principals';
import { buildProviderEnv } from '../../lib/scaleway/provider-env';
import { createProject, listProjects, resolveOrganizationIdFromKey } from '../../lib/scaleway/scaleway-account';
import { ensureBootstrapDnsGrant, removeBootstrapDnsGrant, resolveOrganizationId } from '../../lib/scaleway/scaleway-iam';
import { createSecretManagerClient } from '../../lib/scaleway/scaleway-secret-manager';
import { secretManagerPath } from '../../lib/scaleway/secret-paths';
import type { Environment } from '../../lib/stack/bootstrap-stack-state';
import { lockKey, makeControlClient, readObjectText, stateBucket } from '../../lib/stack/control-store';
import { projectChoices, projectsOfOtherModes } from '../../lib/stack/project-per-mode';
import { runPulumiUpWithHint } from '../../lib/stack/pulumi-up';
import { changeMark, checkMark, DIVIDER, pc, warningMark, withSpinner } from '../../lib/utils/cli-output';
import { LEGACY_ADMIN_KEY_NAMES, writeModeEnvValues } from '../../lib/utils/env-files';
import { errorMessage } from '../../lib/utils/errors';
import { infraDir } from '../../lib/utils/paths';
import { storeCustodiedPassphrase } from '../../tasks/passphrase-custody';
import { provisionManagedKey } from '../../tasks/provision-managed-key';
import { seedOperatorSecrets } from '../../tasks/seed-operator-secrets';
import { setupAdminApp } from '../../tasks/setup-admin-app';
import { setupCiKey } from '../../tasks/setup-ci-key';
import { ensureRegistryPrincipals } from '../../tasks/setup-service-apps';
import { maskedSecret } from '../prompts/masked-secret';
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
import { acquireOperatorKey, operatorLock } from './operator-unlock';
import { OWNER_KEY_HINT, type OwnerKey } from './owner-key';
import { keyForProject } from './project-key';

/** An optional masked value: empty when the prompt cannot run (no terminal), while a Ctrl-C at it still leaves the wizard. */
async function optionalSecret(message: string): Promise<string> {
  try {
    return await maskedSecret({ message });
  } catch (error) {
    if (endsAction(error)) throw error;
    return '';
  }
}

/** Everything the per-phase helpers below share. */
interface SetupContext {
  context: InfraContext;
  appConfig: InfraContext['appConfig'];
  projectId: string;
  /** The Owner API key (provider auth + IAM / Secret Manager work). */
  accessKey: string;
  secretKey: string;
  /** The key for the state side (backend login, stack lock): the admin application key once this machine holds it. */
  stateKey: KeyPair;
  stackName: string;
  /** Secret Manager folder for this stack's runtime secrets. */
  runtimeSecretPath: string;
  /** Child-process env carrying the provider key + passphrase. */
  childEnv: NodeJS.ProcessEnv;
  must: ReturnType<typeof createStepRunner>['must'];
}

/** Optional operator secret values gathered at the first-setup prompts. */
interface OperatorSecretValues {
  adminEmail: string;
  brevoApiKey: string;
}

/** What the operator opted into at the setup prompts. Both are applied after the first `pulumi up`, once the containers exist. */
interface BootstrapSecretInputs {
  operatorSecrets: OperatorSecretValues;
  /** Managed-key id → whether the operator asked to mint it now. */
  mintDecisions: Map<ManagedKeyId, boolean>;
}

/** Result of the CI-deploy-key phase; empty strings when nothing was minted. */
interface CiKeyResult {
  accessKey: string;
  secretKey: string;
  organizationId: string;
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
 * Advisory-only drift check of the live CI grant against the code-defined rule shapes.
 * Compared per rule (sets AND condition), because a permission-set union hides a missing rule whose sets survive elsewhere and a condition on a rule that must stay unconditioned.
 */
async function warnOnCiPolicyDrift(ctx: SetupContext): Promise<void> {
  try {
    const liveRules = await fetchAppRulesByName({
      secretKey: ctx.secretKey,
      projectId: ctx.projectId,
      applicationName: principalNames(ctx.appConfig.slug, ctx.context.environment).ciDeploy,
    });
    if (!liveRules) return;
    const setKey = (sets: readonly string[]): string => [...sets].sort().join(',');
    const liveByKey = new Map(liveRules.map((rule) => [setKey(rule.permissionSets), rule]));
    const problems: string[] = [];
    for (const shape of CI_RULE_SHAPES) {
      const live = liveByKey.get(setKey(shape.permissionSets));
      if (!live) {
        problems.push(`missing rule [${shape.id}: ${shape.permissionSets.join(', ')}]`);
        continue;
      }
      if (live.condition) problems.push(`rule [${shape.id}] carries a condition '${live.condition}' (CI rules are unconditioned by design)`);
      liveByKey.delete(setKey(shape.permissionSets));
    }
    for (const [key, rule] of liveByKey) problems.push(`unexpected rule [${rule.policyName}: ${key}]`);
    if (problems.length > 0) {
      console.warn(
        `  ${warningMark} CI policy has drifted from code: ${problems.join('; ')}. ` + `Run ${pc.cyan(actionCommand('rotate-keys'))} to reconcile.`,
      );
    }
  } catch {
    // IAM unreachable (e.g. fresh project): skip the advisory drift check.
  }
}

/** Mint (or rotate) the CI deploy key, retrying on operator confirm. */
async function mintCiKey(ctx: SetupContext, keyMintAppIds?: readonly string[]): Promise<CiKeyResult> {
  while (true) {
    try {
      const key = await setupCiKey({
        callerSecretKey: ctx.secretKey,
        projectId: ctx.projectId,
        slug: ctx.appConfig.slug,
        mode: ctx.context.environment,
        dnsZone: deriveInfra(ctx.appConfig).dnsZone,
        keyMintAppIds,
      });
      return { accessKey: key.accessKey, secretKey: key.secretKey, organizationId: key.organizationId };
    } catch (error) {
      console.error(`\n${warningMark} CI key setup failed: ${errorMessage(error)}`);
      if (!(await confirm({ message: 'Retry?', default: true }))) return { accessKey: '', secretKey: '', organizationId: '' };
    }
  }
}

/** How long a key made a moment ago gets to be accepted by Object Storage. */
const STATE_ACCESS_LIMIT_MS = 120_000;
const STATE_ACCESS_POLL_MS = 3000;

/**
 * Move the state side of this run to the admin application key. The first `pulumi up` puts a policy on the state bucket that admits the admin
 * and CI applications only, so a user key that writes the state is shut out in the middle of that up. A key made a moment ago is not accepted
 * by Object Storage at once: the run waits until the bucket answers it, and stops when it never does.
 */
async function moveStateSideTo(ctx: SetupContext, adminKey: KeyPair): Promise<void> {
  if (ctx.stateKey.accessKey === adminKey.accessKey) return;
  const s3 = await makeControlClient(ctx.appConfig.s3.region, adminKey.accessKey, adminKey.secretKey);
  const bucket = stateBucket(ctx.appConfig.slug);
  const startedAt = Date.now();
  await withSpinner('Waiting until the state bucket accepts the admin application key', async () => {
    for (;;) {
      try {
        await readObjectText(s3, bucket, lockKey(ctx.stackName));
        return;
      } catch (error) {
        if (Date.now() - startedAt >= STATE_ACCESS_LIMIT_MS) {
          throw new Error(
            `The state bucket ${bucket} refuses the admin application key (${errorMessage(error)}). Run \`${actionCommand('resume')}\` in a minute: it continues from here.`,
          );
        }
        await new Promise((resolve) => setTimeout(resolve, STATE_ACCESS_POLL_MS));
      }
    }
  });
  ctx.stateKey = adminKey;
  ctx.childEnv.AWS_ACCESS_KEY_ID = adminKey.accessKey;
  ctx.childEnv.AWS_SECRET_ACCESS_KEY = adminKey.secretKey;
}

/**
 * Admin IAM application, created on fresh/rotate (the Owner API key holds IAMManager). It grants Object Storage full plus
 * read-only infra rights for `pulumi preview --refresh`, teardown, and bucket recovery, never IAM write. Its key lives in
 * Secret Manager and is never printed or stored as a GitHub secret. Idempotent: reuses the app.
 * The id is never persisted: every consumer resolves it from IAM by its canonical name.
 */
async function ensureAdminApp(ctx: SetupContext): Promise<string> {
  let admin: Awaited<ReturnType<typeof setupAdminApp>>;
  try {
    admin = await setupAdminApp({
      callerSecretKey: ctx.secretKey,
      projectId: ctx.projectId,
      slug: ctx.appConfig.slug,
      mode: ctx.context.environment,
      region: ctx.appConfig.s3.region,
    });
    // This machine holds the Owner API key right now, so it gets the admin application key too: every later CLI run (status, preview, the state side of Apply) authenticates with it.
    const written = writeModeEnvValues(
      ctx.context.environment,
      { SCW_ADMIN_ACCESS_KEY: admin.accessKey, SCW_ADMIN_SECRET_KEY: admin.secretKey },
      { remove: LEGACY_ADMIN_KEY_NAMES },
    );
    console.info(
      `  ${checkMark} Admin application key ('${principalNames(ctx.appConfig.slug, ctx.context.environment).admin}') written to ${written.path} (SCW_ADMIN_ACCESS_KEY / SCW_ADMIN_SECRET_KEY)`,
    );
  } catch (error) {
    console.warn(`${warningMark} Admin app setup failed: ${errorMessage(error)}`);
    return '';
  }
  // Outside the catch above: a state bucket that refuses the key stops the run, since going on would lose the state.
  await moveStateSideTo(ctx, { accessKey: admin.accessKey, secretKey: admin.secretKey });
  return admin.applicationId;
}

function printSummary(opts: { needsCiKey: boolean; ciAccessKey: string; adminAppId: string; names: PrincipalNames }): void {
  const { needsCiKey, ciAccessKey, adminAppId, names } = opts;
  const divider = pc.dim(DIVIDER);
  console.info(`\n${divider}`);
  if (!needsCiKey) {
    console.info(`${checkMark} ${pc.bold('Resume verified.')} Existing keys left unchanged.`);
  } else if (ciAccessKey) {
    console.info(`${checkMark} ${pc.bold(pc.greenBright('Bootstrap complete.'))} CI deploy key ('${names.ciDeploy}'): ${pc.cyanBright(ciAccessKey)}`);
  } else {
    console.info(`${warningMark} ${pc.bold(pc.yellowBright('Done, but CI key was not created.'))} Run ${pc.cyan(actionCommand('rotate-keys'))}.`);
  }
  if (adminAppId) {
    console.info(
      `  ${checkMark} Admin IAM app '${names.admin}': ${pc.cyanBright(adminAppId)}\n` +
        `    ${pc.dim('Its key is in infra/.env.<mode> here and in Secret Manager (admin-key); on another machine run `pnpm infra fetch-admin-key` with your Owner API key.')}`,
    );
  }
  console.info(divider);
}

/**
 * Mint the scoped Scaleway IAM keys the operator opted into, once `pulumi up` has created their empty runtime-secret containers.
 * Non-fatal per key: a mint failure warns and continues, and the key can be minted later via "Manage runtime secrets".
 */
async function provisionConfirmedManagedKeys(ctx: SetupContext, mintDecisions: Map<ManagedKeyId, boolean>): Promise<void> {
  for (const key of managedKeys) {
    if (!mintDecisions.get(key.id)) continue;
    console.info(`\n→ Minting ${key.label} key (${ctx.appConfig.slug}-${key.suffix})`);
    try {
      const result = await provisionManagedKey({
        definition: key,
        callerSecretKey: ctx.secretKey,
        projectId: ctx.projectId,
        region: ctx.appConfig.s3.region,
        slug: ctx.appConfig.slug,
        mode: ctx.context.environment,
        path: ctx.runtimeSecretPath,
      });
      console.info(`  ${checkMark} Minted ${key.label} ${pc.dim(`(app ${result.applicationId})`)}`);
    } catch (error) {
      console.warn(`  ${warningMark} ${key.label} mint failed: ${errorMessage(error)}. Mint later via "Manage runtime secrets".`);
    }
  }
}

/**
 * Validate DNS, lock the stack, defer fresh compute, and converge Pulumi.
 * Once secret containers exist, seed operator values and mint requested keys.
 */
async function provisionBaseInfra(ctx: SetupContext, inputs: BootstrapSecretInputs): Promise<void> {
  const { dnsZone, hasDomain } = deriveInfra(ctx.appConfig);
  if (hasDomain) {
    try {
      // A setup key owned by an application needs org-wide DNS before the first up can write records in an org-shared zone.
      const organizationId = ctx.childEnv.SCW_DEFAULT_ORGANIZATION_ID;
      if (organizationId) {
        await ensureBootstrapDnsGrant({
          callerSecretKey: ctx.secretKey,
          accessKey: ctx.accessKey,
          organizationId,
          slug: ctx.appConfig.slug,
        }).catch((error) => console.warn(`  ${warningMark} Bootstrap DNS grant skipped: ${errorMessage(error)}`));
      }
      await ensureDnsZone({ secretKey: ctx.secretKey, projectId: ctx.projectId, domain: dnsZone });
    } catch (error) {
      if (endsAction(error)) throw error;
      console.error(`\n${warningMark} DNS zone check failed: ${errorMessage(error)}`);
      if (!(await confirmOrDefault({ message: 'Continue with pulumi up anyway?', default: false }))) endAction(1);
    }
  }

  // The first up puts the policy on the state bucket, which admits the admin and CI applications only: a run whose state side is still the
  // Owner API key would be shut out of its own state halfway.
  if (ctx.context.state === 'fresh' && ctx.stateKey.accessKey === ctx.accessKey) {
    endActionWithHint('The first provisioning needs the admin application key for the Pulumi state, and this run has none (see the warning above)', {
      command: actionCommand('resume'),
      description: 'creates the admin application, then provisions',
    });
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
  if (firstProvision) {
    console.info(`${pc.dim('  first provisioning runs with the Owner API key (the CI key is read-only on VPC/PN/RDB and cannot create them)')}`);
    // Fresh provision: no images exist yet, so compute is deferred until CI pushes them (helpers gate on this marker).
    const startedAt = new Date().toISOString();
    spawnSync('pulumi', ['config', 'set', 'bootstrap:computeDeferred', startedAt, '--stack', ctx.stackName], {
      cwd: infraDir,
      env: ctx.childEnv,
      stdio: 'inherit',
    });
  }

  // The Scaleway provider authenticates from SCW_* env (childEnv), which carries the Owner API key on fresh and resume runs alike.
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
  if (firstProvision) {
    spawnSync('pulumi', ['config', 'rm', 'bootstrap:computeDeferred', '--stack', ctx.stackName], {
      cwd: infraDir,
      env: ctx.childEnv,
      stdio: 'ignore',
    });
  }
  console.info(`\n${checkMark} Base infrastructure provisioned (no compute yet). The next deploy, local or CI, brings the VMs up.`);

  // Seed prompted values only after Pulumi creates the empty secret containers; skipped values stay available through "Manage runtime secrets".
  await seedOperatorSecrets({
    secretKey: ctx.secretKey,
    projectId: ctx.projectId,
    region: ctx.appConfig.s3.region,
    slug: ctx.appConfig.slug,
    mode: ctx.context.environment,
    values: { adminEmail: inputs.operatorSecrets.adminEmail || undefined, brevoApiKey: inputs.operatorSecrets.brevoApiKey || undefined },
  });

  // Mint the scoped Scaleway IAM keys the operator opted into (containers now exist).
  await provisionConfirmedManagedKeys(ctx, inputs.mintDecisions);

  await stackLock.release();
}

/**
 * Pick or create this environment's Scaleway project when it has none yet, using the Owner API key. Every environment has a project of its own:
 * the project of another environment is listed and cannot be taken. The chosen id is written to infra/.env.<mode> as SCW_PROJECT_ID.
 */
async function ensureProjectId(opts: { slug: string; mode: Environment; accessKey: string; secretKey: string }): Promise<string> {
  console.info(`\n→ Scaleway project for ${opts.mode} ${pc.dim('(none configured yet)')}`);
  const { organizationId, projects } = await withSpinner('Loading Scaleway projects', async () => {
    const organizationId = await resolveOrganizationIdFromKey(opts.secretKey, opts.accessKey);
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
 * Runs the same one-command deploy CI runs with --build (local docker buildx), authenticated with the freshly minted CI deploy key so it also proves the CI key path.
 * Skipped when docker or a git HEAD is unavailable.
 */
async function offerFirstDeploy(ctx: SetupContext, ciKey: CiKeyResult, inputs: BootstrapSecretInputs): Promise<void> {
  const mode = ctx.context.environment;
  const manualCmd = (sha: string) => `pnpm --filter infra run deploy --mode ${mode} --sha ${sha} --build`;
  if (spawnSync('docker', ['buildx', 'version'], { stdio: 'ignore' }).status !== 0) {
    console.info(`\n${pc.dim('docker (with buildx) not found; skipping the first deploy. Run it later:')} ${pc.cyan(manualCmd('<git-sha>'))}`);
    return;
  }
  const sha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: infraDir, encoding: 'utf8' }).stdout?.trim();
  if (!sha) {
    console.info(`\n${pc.dim('Could not resolve git HEAD; skipping the first deploy. Run it later:')} ${pc.cyan(manualCmd('<git-sha>'))}`);
    return;
  }
  const hasAdminEmail = !!inputs.operatorSecrets.adminEmail;
  if (!hasAdminEmail) {
    console.warn(
      `  ${warningMark} No admin email is set, and the deploy preflight requires the ${pc.bold('admin-email')} runtime secret.\n` +
        `    Set it first via "Manage runtime secrets", or the deploy will fail before rolling anything.`,
    );
  }
  const deployNow = autoAcceptDefaults()
    ? hasAdminEmail
    : await confirm({
        message: `Deploy ${sha.slice(0, 7)} to ${mode} now? Builds images locally, then rolls out (10-20 min).`,
        default: hasAdminEmail,
      });
  if (!deployNow) {
    console.info(`  ${pc.dim('Deploy later from CI (publish a release / run the Deploy workflow) or locally:')} ${pc.cyan(manualCmd(sha))}`);
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
  const { status } = spawnSync('pnpm', ['run', 'deploy', '--mode', mode, '--sha', sha, '--build'], {
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

/** A setup run can include the first `pulumi up` and a first deploy, so its minted key lives longer than an action's half hour. */
const SETUP_KEY_TTL_MS = 3 * 60 * 60_000;

/**
 * Set up or resume a stack: key, project, identities, CI key, state backend, and base infrastructure. A first setup, and a stack that has no
 * operator application yet, run on the Owner API key typed at the prompt. Every other run takes a key minted from the operator key, which is
 * revoked on every way out.
 */
export async function runSetup(context: InfraContext, mode: Extract<CliMode, 'resume' | 'rotate-keys'>): Promise<void> {
  const hasOperator = context.state !== 'fresh' && (await operatorLock(context)).state !== 'absent';
  const operatorKey = hasOperator ? await acquireOperatorKey(context, { ttlMs: SETUP_KEY_TTL_MS }) : undefined;
  try {
    await runSetupWith(context, mode, operatorKey);
  } finally {
    await operatorKey?.release();
  }
}

async function runSetupWith(
  context: InfraContext,
  mode: Extract<CliMode, 'resume' | 'rotate-keys'>,
  operatorKey: OwnerKey | undefined,
): Promise<void> {
  const pasted = operatorKey ?? (await keyPairOrPrompt(undefined, 'Scaleway Owner API key', OWNER_KEY_HINT));
  // After the key: an unlocked session fetches the passphrase, so nobody types it.
  const passphrase = await resolveOrCreatePassphrase(context.stackYaml);
  const projectId =
    context.projectId ||
    (await ensureProjectId({ slug: context.appConfig.slug, mode: context.environment, accessKey: pasted.accessKey, secretKey: pasted.secretKey }));

  // A key minted from the operator key already names this project. An Owner API key typed at the prompt names the project it was created for, which
  // with a project per environment is often another environment's: the run then takes a key of the same bearer for this project.
  const key = operatorKey
    ? { accessKey: pasted.accessKey, secretKey: pasted.secretKey, minted: false, release: async () => {} }
    : await withSpinner('Checking the project the key points at', () => keyForProject(pasted, projectId));
  if (key.minted) {
    console.info(
      `${checkMark} The Owner API key points at another project, so this run works with key ${key.accessKey}, made for project ${projectId} and deleted when the run ends.`,
    );
  }
  try {
    await runSetupSteps(context, mode, { operatorKey, pasted, key, passphrase, projectId });
  } finally {
    await key
      .release()
      .catch((error) =>
        console.warn(
          `${warningMark} Could not delete key ${key.accessKey} (${errorMessage(error)}). Delete it in the console: ${pc.underline('https://console.scaleway.com/iam/api-keys')}`,
        ),
      );
  }
}

/** The keys, passphrase and project a setup run works with. */
interface SetupAccess {
  operatorKey: OwnerKey | undefined;
  /** The key the run started with: the Owner API key typed at the prompt, or the key minted from the operator key. */
  pasted: KeyPair;
  /** The key every step uses: `pasted`, or the key minted for this project. */
  key: KeyPair;
  passphrase: { passphrase: string; generated: boolean };
  projectId: string;
}

async function runSetupSteps(context: InfraContext, mode: Extract<CliMode, 'resume' | 'rotate-keys'>, access: SetupAccess): Promise<void> {
  const needsCiKey = mode === 'rotate-keys' || !context.hasCiKey;
  const identity = resolveOperatorIdentity();
  const { operatorKey, pasted, projectId: scwProjectId } = access;
  const ownerKeyPasted = !operatorKey;
  // Provider authentication and all IAM / Secret Manager work use this key through SCW_* env (childEnv below), never stack config.
  const { accessKey: scwAccessKey, secretKey: scwSecretKey } = access.key;
  const { passphrase: pulumiPassphrase, generated: passphraseGenerated } = access.passphrase;

  const stackName = stackNameFor(context);

  // Prompt for operator secrets and managed-key decisions only on the first setup; keys are minted after the first infrastructure update creates their containers.
  const isFirstSetup = !context.hasCiKey;
  const inputs: BootstrapSecretInputs = { operatorSecrets: { adminEmail: '', brevoApiKey: '' }, mintDecisions: new Map<ManagedKeyId, boolean>() };
  if (isFirstSetup) {
    inputs.operatorSecrets.adminEmail = await inputOrDefault({
      message: 'Admin email (optional, set later via "Manage runtime secrets")',
      envName: 'INFRA_ADMIN_EMAIL',
    });
    inputs.operatorSecrets.brevoApiKey = inputs.operatorSecrets.adminEmail ? await optionalSecret('Brevo API key (optional)') : '';
    for (const key of managedKeys) {
      inputs.mintDecisions.set(key.id, await confirmOrDefault({ message: key.prompt.message, default: key.prompt.default }));
    }
  }

  const proceedWith =
    mode === 'rotate-keys'
      ? actionLabel('rotate-keys')
      : context.state === 'fresh'
        ? `the first setup of ${context.environment}`
        : actionLabel('resume');
  if (!(await confirmOrDefault({ message: `Proceed with ${proceedWith}?`, default: true }))) return;

  // The state side (login, lock) takes the admin application key when this machine holds one, as Apply does. A first setup has none yet: it
  // starts on the Owner API key, which creates the bucket, and moves to the admin application key as soon as that exists (moveStateSideTo).
  const stateKey: KeyPair = identity.admin
    ? { accessKey: identity.admin.accessKey, secretKey: identity.admin.secretKey }
    : { accessKey: scwAccessKey, secretKey: scwSecretKey };
  const childEnv = buildProviderEnv(infraDir, {
    accessKey: scwAccessKey,
    secretKey: scwSecretKey,
    projectId: scwProjectId,
    passphrase: pulumiPassphrase,
    stateAccessKey: stateKey.accessKey,
    stateSecretKey: stateKey.secretKey,
  });

  // The Pulumi program requires SCW_DEFAULT_ORGANIZATION_ID (pulumi-context.ts requireEnv), so resolve it here for the provisioning `up`.
  try {
    childEnv.SCW_DEFAULT_ORGANIZATION_ID = await resolveOrganizationId(scwSecretKey, scwProjectId);
  } catch (error) {
    console.warn(
      `${warningMark} Could not resolve organization id (${errorMessage(error)}); \`pulumi up\` will fail without SCW_DEFAULT_ORGANIZATION_ID in the environment.`,
    );
  }

  const stateBucketEnv: NodeJS.ProcessEnv = { ...childEnv, SCW_ACCESS_KEY: scwAccessKey, SCW_SECRET_KEY: scwSecretKey };

  const { must } = createStepRunner(infraDir, childEnv);
  const { appConfig } = context;
  const ctx: SetupContext = {
    context,
    appConfig,
    projectId: scwProjectId,
    accessKey: scwAccessKey,
    secretKey: scwSecretKey,
    stateKey,
    stackName,
    runtimeSecretPath: secretManagerPath(appConfig.slug, context.environment),
    childEnv,
    must,
  };

  // State backend + stack
  await must('Ensure Pulumi state bucket', 'pnpm', ['ensure-state-bucket'], spawnSync, { retry: true, env: stateBucketEnv });
  await must('Pulumi login (S3 backend)', 'pulumi', ['login', pulumiLoginUrl(appConfig)], spawnSync, { retry: true });
  const selected = spawnSync('pulumi', ['stack', 'select', stackName], { cwd: infraDir, env: childEnv, stdio: 'ignore' });
  if (selected.status === 0) {
    console.info(`\n→ Pulumi stack: ${stackName} (exists: selected)`);
  } else {
    await must('Pulumi stack init', 'pulumi', ['stack', 'init', stackName], spawnSync);
  }

  // Seed operator secret values after the first `pulumi up`; Pulumi owns their containers.
  // The pre-apply gap check is read-only.
  if (!inputs.operatorSecrets.adminEmail) await warnOnMissingOperatorSecrets(ctx);

  // Identities: per-service + boot apps, CI deploy key, admin app. Service apps come FIRST: their ids feed the CI policy's key-mint rule.
  let serviceAppIds: readonly string[] = [];
  if (needsCiKey) {
    console.info('\n→ Service VM applications (registry principals; keys minted per deploy)');
    try {
      const apps = await ensureRegistryPrincipals({
        callerSecretKey: ctx.secretKey,
        projectId: ctx.projectId,
        slug: appConfig.slug,
        mode: context.environment,
        singleVM: appConfig.singleVM ?? false,
      });
      serviceAppIds = apps.allAppIds;
    } catch (error) {
      console.warn(
        `${warningMark} Service app setup failed: ${errorMessage(error)}: the CI key-mint rule will be omitted; run \`${actionCommand('rotate-keys')}\`.`,
      );
    }
  }

  let ciKey: CiKeyResult = { accessKey: '', secretKey: '', organizationId: '' };
  if (needsCiKey) {
    ciKey = await mintCiKey(ctx, serviceAppIds.length > 0 ? serviceAppIds : undefined);
  } else {
    console.info('\n→ CI deploy key: skipped (already in stack config)');
    await warnOnCiPolicyDrift(ctx);
  }

  // Only a fresh/rotate run touches the admin app; a Resume leaves it alone and reports nothing about it (`infra status` resolves it from IAM).
  const adminAppId = needsCiKey ? await ensureAdminApp(ctx) : '';

  // The passphrase goes into Secret Manager beside the admin key, so later runs fetch it with the operator key and nobody types it.
  await storeCustodiedPassphrase({
    secretKey: scwSecretKey,
    region: appConfig.s3.region,
    projectId: scwProjectId,
    slug: appConfig.slug,
    mode: context.environment,
    passphrase: pulumiPassphrase,
  }).catch((error) =>
    console.warn(`${warningMark} Could not store the passphrase in Secret Manager (${errorMessage(error)}); it is asked once on the next run.`),
  );

  // Identity ids come from the IAM API, so stack config only needs a non-secret bootstrap marker.
  const bootstrapComplete = context.hasCiKey || !!ciKey.accessKey;
  if (bootstrapComplete) {
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
    environment: context.environment,
    ciKey: ciKey.accessKey
      ? { accessKey: ciKey.accessKey, secretKey: ciKey.secretKey, projectId: scwProjectId, organizationId: ciKey.organizationId }
      : undefined,
    passphrase: pulumiPassphrase,
  });
  if (!synced) {
    console.warn(
      `\n${warningMark} GitHub sync skipped (gh not authenticated or origin is not a GitHub remote).\n` +
        `  Add the Environment secrets manually${passphraseGenerated ? `: including the just-generated ${pc.bold('PULUMI_CONFIG_PASSPHRASE')}` : ''}.\n` +
        '  The environment holds: SCW_ACCESS_KEY, SCW_SECRET_KEY, SCW_PROJECT_ID, SCW_ORGANIZATION_ID, PULUMI_CONFIG_PASSPHRASE.',
    );
  }

  printSummary({ needsCiKey, ciAccessKey: ciKey.accessKey, adminAppId, names: principalNames(appConfig.slug, context.environment) });

  // Base infrastructure provisioning
  const canDeploy = context.hasCiKey || !!ciKey.accessKey;
  if (canDeploy) {
    console.info(`\n${pc.bold('Next: provision base infrastructure')} (registry, DB, network, no compute yet)`);
    // A fresh stack's first provision needs a local `pulumi up` with the Owner API key because the CI key cannot create VPC/PN/RDB; afterwards CI runs `pulumi up` on push.
    const isFirstProvision = context.state === 'fresh';
    if (!isFirstProvision) {
      console.info(
        `  ${pc.dim('Recommended: push to the deploy branch and let CI run `pulumi up` (this local run is only needed for out-of-band changes).')}`,
      );
    }
    const runNow = await confirmOrDefault({
      message: isFirstProvision ? 'Run the recommended first pulumi up now?' : 'Run pulumi up now?',
      default: isFirstProvision,
    });
    if (runNow) {
      await provisionBaseInfra(ctx, inputs);
      // Only a first setup still holds the CI key secret in memory; rotate and resume leave deploys to CI.
      if (isFirstSetup && ciKey.secretKey) {
        await offerFirstDeploy(ctx, ciKey, inputs);
      }
    } else {
      console.info(`  ${pc.dim(`Recommended: run \`${actionCommand('resume')}\` to retry.`)}`);
      console.info('  Manual fallback if needed:');
      console.info(
        `  ${pc.cyan(`cd infra && SCW_ACCESS_KEY=<owner-access> SCW_SECRET_KEY=<owner-secret> AWS_ACCESS_KEY_ID=<admin-access> AWS_SECRET_ACCESS_KEY=<admin-secret> PULUMI_CONFIG_PASSPHRASE='<passphrase>' pulumi up --stack ${stackName}`)}`,
      );
    }
  }
  if (needsCiKey && ciKey.accessKey) {
    // The org-wide bootstrap DNS grant is the widest grant the engine creates and must not outlive this wizard; CI's project-scoped DNS grant covers routine deploys.
    if (childEnv.SCW_DEFAULT_ORGANIZATION_ID) {
      await removeBootstrapDnsGrant({
        callerSecretKey: scwSecretKey,
        organizationId: childEnv.SCW_DEFAULT_ORGANIZATION_ID,
        slug: appConfig.slug,
      }).catch((error) =>
        console.warn(
          `${warningMark} Could not remove the bootstrap DNS grant: ${errorMessage(error)}. Delete the '${appConfig.slug}-bootstrap-dns' policy in the console.`,
        ),
      );
    }
    // Revoking the key is the last call because a key may delete itself. Only an Owner API key typed at the prompt is offered: a key minted from the operator key is revoked by the caller.
    const revokeNow = !ownerKeyPasted
      ? false
      : autoAcceptDefaults()
        ? true
        : await confirm({
            message: `Revoke the Owner API key you pasted (${pasted.accessKey}) now? Nothing else needs it: day-2 privileged actions run on the operator key.`,
            default: true,
          });
    if (revokeNow) {
      try {
        await withSpinner('Revoking the setup key', () => deleteApiKey({ secretKey: pasted.secretKey }, pasted.accessKey));
        console.info(`${checkMark} Key ${pasted.accessKey} revoked.`);
      } catch (error) {
        console.warn(
          `${warningMark} Could not revoke the key (${errorMessage(error)}). Delete it in the console: ${pc.underline('https://console.scaleway.com/iam/api-keys')}`,
        );
      }
    } else if (ownerKeyPasted) {
      console.info(
        `\n${pc.dim('Reminder:')} revoke the Owner API key you pasted (${pasted.accessKey}) if it was created for this setup: console → IAM → API keys.`,
      );
    }
  }
  if (!operatorKey) {
    console.info(
      `\n${pc.dim('Next:')} ${pc.cyan(actionCommand('operator-key'))} ${pc.dim('creates the operator key for day-to-day work, which Scaleway accepts from your dedicated IP address only.')}`,
    );
  }
}
