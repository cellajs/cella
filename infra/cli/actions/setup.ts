import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { confirm, select } from '@inquirer/prompts';
import { syncGithubEnvironment } from '../../lib/github-sync';
import { type ManagedKeyId, managedKeys } from '../../lib/managed-keys';
import { deriveInfra } from '../../lib/naming';
import { operatorManagedRuntimeSecrets } from '../../lib/runtime-secrets';
import { buildProviderEnv } from '../../lib/scaleway/bootstrap-scw-env';
import { ensureDnsZone } from '../../lib/scaleway/ensure-dns-zone';
import { fetchAppRulesByName } from '../../lib/scaleway/iam-client';
import { CI_RULE_SHAPES } from '../../lib/scaleway/permissions';
import { principalNames } from '../../lib/scaleway/principals';
import { createProject, listProjects, resolveOrganizationIdFromKey } from '../../lib/scaleway/scaleway-account';
import {
  ensureBootstrapDnsGrant,
  removeBootstrapDnsGrant,
  resolveOrganizationId,
  revokeApiKey,
} from '../../lib/scaleway/scaleway-iam';
import { createSecretManagerClient } from '../../lib/scaleway/scaleway-secret-manager';
import { secretManagerPath } from '../../lib/scaleway/secret-paths';
import { runPulumiUpWithHint } from '../../lib/stack/pulumi-up';
import { changeMark, checkMark, DIVIDER, failWithHint, pc, warningMark, withSpinner } from '../../lib/utils/cli-output';
import { writeEnvVar } from '../../lib/utils/env-file';
import { errorMessage } from '../../lib/utils/errors';
import { infraDir } from '../../lib/utils/paths';
import { provisionManagedKey } from '../../tasks/provision-managed-key';
import { seedOperatorSecrets } from '../../tasks/seed-operator-secrets';
import { setupAdminApp } from '../../tasks/setup-admin-app';
import { setupCiKey } from '../../tasks/setup-ci-key';
import { setupServiceApps } from '../../tasks/setup-service-apps';
import { maskedSecret } from '../prompts/masked-secret';
import type { CliMode, InfraContext } from '../shared';
import {
  acquireStackLockOrExit,
  autoAcceptDefaults,
  confirmOrDefault,
  createStepRunner,
  envOr,
  inputOrDefault,
  nonInteractive,
  promptRequiredInput,
  promptStackName,
  pulumiLoginUrl,
  resolveOrCreatePassphrase,
} from '../shared';

/** Everything the per-phase helpers below share. */
interface SetupContext {
  context: InfraContext;
  appConfig: InfraContext['appConfig'];
  projectId: string;
  /** Operator bootstrap key (provider auth + IAM / Secret-Manager work). */
  accessKey: string;
  secretKey: string;
  stackName: string;
  /** Secret Manager folder for this stack's runtime secrets. */
  runtimeSecretPath: string;
  /** Child-process env carrying the provider credentials + passphrase. */
  childEnv: NodeJS.ProcessEnv;
  must: ReturnType<typeof createStepRunner>['must'];
}

/** Optional operator secret values gathered at the initial-bootstrap prompts. */
interface OperatorSecretValues {
  adminEmail: string;
  brevoApiKey: string;
}

/** What the operator opted into at the bootstrap prompts. Both are applied after the first `pulumi up`, once the containers exist. */
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
    const client = createSecretManagerClient({
      secretKey: ctx.secretKey,
      region: ctx.appConfig.s3.region,
      projectId: ctx.projectId,
    });
    const existing = await client.listSecretsUnder(ctx.runtimeSecretPath);
    const versioned = new Set(
      existing.filter((secret) => (secret.version_count ?? 0) > 0).map((secret) => secret.name),
    );
    const missing = operatorManagedRuntimeSecrets.filter(
      (secret) => secret.required && !versioned.has(secret.secretName),
    );
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
      if (live.condition)
        problems.push(
          `rule [${shape.id}] carries a condition '${live.condition}' (CI rules are unconditioned by design)`,
        );
      liveByKey.delete(setKey(shape.permissionSets));
    }
    for (const [key, rule] of liveByKey) problems.push(`unexpected rule [${rule.policyName}: ${key}]`);
    if (problems.length > 0) {
      console.warn(
        `  ${warningMark} CI policy has drifted from code: ${problems.join('; ')}. ` +
          `Re-run bootstrap and choose ${pc.italic('"Rotate keys"')} to reconcile.`,
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
      if (nonInteractive() || !(await confirm({ message: 'Retry?', default: true })))
        return { accessKey: '', secretKey: '', organizationId: '' };
    }
  }
}

/**
 * Admin IAM application, created on fresh/rotate (the bootstrap key holds IAMManager). It grants Object Storage full plus
 * read-only infra rights for `pulumi preview --refresh`, teardown, and bucket recovery, never IAM write. Its key lives in
 * Secret Manager and is never printed or stored as a GitHub secret. Idempotent: reuses the app.
 * The id is never persisted: every consumer resolves it from IAM by its canonical name.
 */
async function ensureAdminApp(ctx: SetupContext): Promise<string> {
  try {
    const admin = await setupAdminApp({
      callerSecretKey: ctx.secretKey,
      projectId: ctx.projectId,
      slug: ctx.appConfig.slug,
      mode: ctx.context.environment,
      region: ctx.appConfig.s3.region,
    });
    return admin.applicationId;
  } catch (error) {
    console.warn(`${warningMark} Admin app setup failed: ${errorMessage(error)}`);
    return '';
  }
}

function printSummary(opts: { needsCiKey: boolean; ciAccessKey: string; adminAppId: string }): void {
  const { needsCiKey, ciAccessKey, adminAppId } = opts;
  const divider = pc.dim(DIVIDER);
  console.info(`\n${divider}`);
  if (!needsCiKey) {
    console.info(`${checkMark} ${pc.bold('Resume verified.')} Existing deploy credentials left unchanged.`);
  } else if (ciAccessKey) {
    console.info(
      `${checkMark} ${pc.bold(pc.greenBright('Bootstrap complete.'))} CI deploy key: ${pc.cyanBright(ciAccessKey)}`,
    );
  } else {
    console.info(
      `${warningMark} ${pc.bold(pc.yellowBright('Done, but CI key was not created.'))} Re-run and choose ${pc.italic('"Rotate keys"')}.`,
    );
  }
  if (adminAppId) {
    console.info(
      `  ${checkMark} Admin IAM app: ${pc.cyanBright(adminAppId)}\n` +
        `    ${pc.dim('Its key pair is stored in Secret Manager (admin-key): retrieve it with a bootstrap key for day-2 pulumi/teardown runs.')}`,
    );
  }
  console.info(divider);
}

/**
 * Mint the scoped Scaleway IAM keys the operator opted into, once `pulumi up` has created their empty runtime-secret containers.
 * Non-fatal per key: a mint failure warns and continues, and the key can be minted later via "Manage runtime secrets".
 */
async function provisionConfirmedManagedKeys(
  ctx: SetupContext,
  mintDecisions: Map<ManagedKeyId, boolean>,
): Promise<void> {
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
      console.warn(
        `  ${warningMark} ${key.label} mint failed: ${errorMessage(error)}. Mint later via "Manage runtime secrets".`,
      );
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
      // Application-owned bootstrap keys need org-wide DNS before the first up can write records in an org-shared zone.
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
      console.error(`\n${warningMark} DNS zone check failed: ${errorMessage(error)}`);
      if (!(await confirmOrDefault({ message: 'Continue with pulumi up anyway?', default: false }))) process.exit(1);
    }
  }

  // Lock provisioning against concurrent operators and CI; every exit path releases it, and abandoned locks expire or clear with "Unlock".
  const stackLock = await acquireStackLockOrExit({
    appConfig: ctx.appConfig,
    accessKey: ctx.accessKey,
    secretKey: ctx.secretKey,
    stack: ctx.stackName,
    operation: 'setup',
  });

  const usingBootstrapKey = ctx.context.state === 'fresh';
  if (usingBootstrapKey) {
    console.info(
      `${pc.dim('  using bootstrap key for first provisioning (CI key has read-only on VPC/PN/RDB: cannot create them)')}`,
    );
    // Fresh provision: no images exist yet, so compute is deferred until CI pushes them (helpers gate on this marker).
    const startedAt = new Date().toISOString();
    spawnSync('pulumi', ['config', 'set', 'bootstrap:computeDeferred', startedAt, '--stack', ctx.stackName], {
      cwd: infraDir,
      env: ctx.childEnv,
      stdio: 'inherit',
    });
  }

  // The Scaleway provider authenticates from SCW_* env (childEnv), which carries the operator bootstrap key on fresh and resume runs alike.
  while (true) {
    const { code } = await runPulumiUpWithHint(ctx.stackName, infraDir, ctx.childEnv);
    if (code === 0) break;
    if (nonInteractive() || !(await confirm({ message: 'Retry?', default: true }))) {
      await stackLock.release();
      failWithHint(
        `Base provisioning failed (pulumi up exited ${code})`,
        { command: 'pnpm infra', description: 'fix the cause above, then re-run and choose "Resume" to continue' },
        code ?? 1,
      );
    }
  }
  if (usingBootstrapKey) {
    spawnSync('pulumi', ['config', 'rm', 'bootstrap:computeDeferred', '--stack', ctx.stackName], {
      cwd: infraDir,
      env: ctx.childEnv,
      stdio: 'ignore',
    });
  }
  console.info(
    `\n${checkMark} Base infrastructure provisioned (no compute yet). The next deploy, local or CI, brings the VMs up.`,
  );

  // Seed prompted values only after Pulumi creates the empty secret containers; skipped values stay available through "Manage runtime secrets".
  await seedOperatorSecrets({
    secretKey: ctx.secretKey,
    projectId: ctx.projectId,
    region: ctx.appConfig.s3.region,
    slug: ctx.appConfig.slug,
    mode: ctx.context.environment,
    values: {
      adminEmail: inputs.operatorSecrets.adminEmail || undefined,
      brevoApiKey: inputs.operatorSecrets.brevoApiKey || undefined,
    },
  });

  // Mint the scoped Scaleway IAM keys the operator opted into (containers now exist).
  await provisionConfirmedManagedKeys(ctx, inputs.mintDecisions);

  await stackLock.release();
}

/**
 * Pick or create the Scaleway project when none is configured yet, using the bootstrap key.
 * The chosen id is written to backend/.env as SCW_PROJECT_ID so later runs resolve it without prompting.
 * Non-interactive runs must supply SCW_PROJECT_ID themselves.
 */
async function ensureProjectId(opts: { slug: string; accessKey: string; secretKey: string }): Promise<string> {
  if (nonInteractive()) {
    throw new Error('SCW_PROJECT_ID is not set. Non-interactive setup requires it in backend/.env or the environment.');
  }
  console.info(`\n→ Scaleway project ${pc.dim('(none configured yet)')}`);
  const { organizationId, projects } = await withSpinner('Loading Scaleway projects', async () => {
    const organizationId = await resolveOrganizationIdFromKey(opts.secretKey, opts.accessKey);
    return { organizationId, projects: await listProjects(opts.secretKey, organizationId) };
  });
  const CREATE = '__create__';
  const existing = projects.find((project) => project.name === opts.slug);
  const choice = await select<string>({
    message: 'Scaleway project for this stack',
    default: existing?.id ?? CREATE,
    loop: false,
    choices: [
      {
        name: `Create project "${opts.slug}"`,
        value: CREATE,
        description: 'Creates a fresh project in your organization.',
      },
      ...projects.map((project) => ({ name: `${project.name} ${pc.dim(`(${project.id})`)}`, value: project.id })),
    ],
  });
  let projectId = choice;
  if (choice === CREATE) {
    const name = await inputOrDefault({ message: 'New project name', default: opts.slug });
    const project = await createProject(opts.secretKey, {
      organizationId,
      name,
      description: 'Created by the infra CLI setup wizard',
    });
    console.info(`  ${changeMark} Created project ${project.name} (${project.id})`);
    projectId = project.id;
  }
  writeEnvVar(resolve(infraDir, '..', 'backend', '.env'), 'SCW_PROJECT_ID', projectId);
  process.env.SCW_PROJECT_ID = projectId;
  console.info(`  ${checkMark} SCW_PROJECT_ID written to backend/.env`);
  return projectId;
}

/**
 * Offer to run the first deploy here, so a fresh setup ends with a live app.
 * Runs the same one-command deploy CI runs with --build (local docker buildx), authenticated with the freshly minted CI deploy key so it also proves the CI credential path.
 * Skipped when docker or a git HEAD is unavailable.
 */
async function offerFirstDeploy(ctx: SetupContext, ciKey: CiKeyResult, inputs: BootstrapSecretInputs): Promise<void> {
  const mode = ctx.context.environment;
  const manualCmd = (sha: string) => `pnpm --filter infra run deploy --mode ${mode} --sha ${sha} --build`;
  if (spawnSync('docker', ['buildx', 'version'], { stdio: 'ignore' }).status !== 0) {
    console.info(
      `\n${pc.dim('docker (with buildx) not found; skipping the first deploy. Run it later:')} ${pc.cyan(manualCmd('<git-sha>'))}`,
    );
    return;
  }
  const sha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: infraDir, encoding: 'utf8' }).stdout?.trim();
  if (!sha) {
    console.info(
      `\n${pc.dim('Could not resolve git HEAD; skipping the first deploy. Run it later:')} ${pc.cyan(manualCmd('<git-sha>'))}`,
    );
    return;
  }
  const hasAdminEmail = !!inputs.operatorSecrets.adminEmail;
  if (!hasAdminEmail) {
    console.warn(
      `  ${warningMark} No admin email is set, and the deploy preflight requires the ${pc.bold('admin-email')} runtime secret.\n` +
        `    Set it first via "Manage runtime secrets", or the deploy will fail before rolling anything.`,
    );
  }
  const deployNow = nonInteractive()
    ? process.env.INFRA_DEPLOY_NOW === '1'
    : autoAcceptDefaults()
      ? hasAdminEmail
      : await confirm({
          message: `Deploy ${sha.slice(0, 7)} to ${mode} now? Builds images locally, then rolls out (10-20 min).`,
          default: hasAdminEmail,
        });
  if (!deployNow) {
    console.info(
      `  ${pc.dim('Deploy later from CI (publish a release / run the Deploy workflow) or locally:')} ${pc.cyan(manualCmd(sha))}`,
    );
    return;
  }
  // The exact env the GitHub Environment holds: CI deploy key as both provider and state-backend credentials, plus the passphrase and project ids from childEnv.
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
    console.info(
      `\n${checkMark} ${pc.bold(pc.greenBright('App is live.'))}${frontendUrl ? ` ${pc.underline(pc.cyanBright(frontendUrl))}` : ''}`,
    );
    if (hasAdminEmail)
      console.info(`  ${pc.dim('Sign in by requesting a magic link for the admin email you provided.')}`);
  } else {
    console.warn(
      `\n${warningMark} First deploy failed (exit ${status}). Boot diagnostics were collected; inspect with ${pc.cyan('pnpm --filter infra diag')}.\n` +
        `  Re-running the same deploy is safe (generations are content-addressed): ${pc.cyan(manualCmd(sha))}`,
    );
  }
}

/** Bootstrap or resume a stack: bootstrap key, project, identities, CI key, state backend, and base infrastructure. */
export async function runSetup(context: InfraContext, mode: Extract<CliMode, 'resume' | 'rotate'>): Promise<void> {
  const needsCiKey = mode === 'rotate' || !context.hasCiKey;
  const { passphrase: pulumiPassphrase, generated: passphraseGenerated } = await resolveOrCreatePassphrase(
    context.stackYaml,
  );

  // Provider authentication and all IAM / Secret-Manager work use an operator bootstrap key read from SCW_* env (childEnv below), not from stack config.
  const scwAccessKey = await envOr('SCW_BOOTSTRAP_ACCESS_KEY', () =>
    promptRequiredInput('Scaleway bootstrap access key'),
  );
  const scwSecretKey = await envOr('SCW_BOOTSTRAP_SECRET_KEY', () =>
    maskedSecret({ message: 'Scaleway bootstrap secret key' }),
  );
  const scwProjectId =
    context.projectId ||
    (await ensureProjectId({ slug: context.appConfig.slug, accessKey: scwAccessKey, secretKey: scwSecretKey }));

  const stackName = await promptStackName(context);

  // Prompt for operator secrets and managed-key decisions only on initial bootstrap; keys are minted after the first infrastructure update creates their containers.
  const isInitialBootstrap = !context.hasCiKey;
  const inputs: BootstrapSecretInputs = {
    operatorSecrets: { adminEmail: '', brevoApiKey: '' },
    mintDecisions: new Map<ManagedKeyId, boolean>(),
  };
  if (isInitialBootstrap) {
    inputs.operatorSecrets.adminEmail = await inputOrDefault({
      message: 'Admin email (optional, set later via "Manage runtime secrets")',
      envName: 'INFRA_ADMIN_EMAIL',
    });
    inputs.operatorSecrets.brevoApiKey =
      inputs.operatorSecrets.adminEmail && !nonInteractive()
        ? await maskedSecret({ message: 'Brevo API key (optional)' }).catch(() => '')
        : '';
    for (const key of managedKeys) {
      inputs.mintDecisions.set(
        key.id,
        await confirmOrDefault({ message: key.prompt.message, default: key.prompt.default }),
      );
    }
  }

  const modeLabel = mode === 'rotate' ? 'Rotate keys' : 'Resume';
  if (!(await confirmOrDefault({ message: `Proceed with ${modeLabel}?`, default: true }))) process.exit(0);

  // The bootstrap key holds the object-storage rights for the Pulumi state bucket, so it doubles as the state-backend credential pair.
  const childEnv = buildProviderEnv(infraDir, {
    accessKey: scwAccessKey,
    secretKey: scwSecretKey,
    projectId: scwProjectId,
    passphrase: pulumiPassphrase,
    stateAccessKey: scwAccessKey,
    stateSecretKey: scwSecretKey,
  });

  // The Pulumi program requires SCW_DEFAULT_ORGANIZATION_ID (pulumi-context.ts requireEnv), so resolve it here for the provisioning `up`.
  try {
    childEnv.SCW_DEFAULT_ORGANIZATION_ID = await resolveOrganizationId(scwSecretKey, scwProjectId);
  } catch (error) {
    console.warn(
      `${warningMark} Could not resolve organization id (${errorMessage(error)}); \`pulumi up\` will fail without SCW_DEFAULT_ORGANIZATION_ID in the environment.`,
    );
  }

  const stateBucketEnv: NodeJS.ProcessEnv = {
    ...childEnv,
    SCW_ACCESS_KEY: scwAccessKey,
    SCW_SECRET_KEY: scwSecretKey,
  };

  const { must } = createStepRunner(infraDir, childEnv);
  const { appConfig } = context;
  const ctx: SetupContext = {
    context,
    appConfig,
    projectId: scwProjectId,
    accessKey: scwAccessKey,
    secretKey: scwSecretKey,
    stackName,
    runtimeSecretPath: secretManagerPath(appConfig.slug, context.environment),
    childEnv,
    must,
  };

  // State backend + stack
  await must('Ensure Pulumi state bucket', 'pnpm', ['ensure-state-bucket'], spawnSync, {
    retry: true,
    env: stateBucketEnv,
  });
  await must('Pulumi login (S3 backend)', 'pulumi', ['login', pulumiLoginUrl(appConfig)], spawnSync, { retry: true });
  const selected = spawnSync('pulumi', ['stack', 'select', stackName], {
    cwd: infraDir,
    env: childEnv,
    stdio: 'ignore',
  });
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
    console.info('\n→ Service VM applications (per-service principals; keys minted per deploy)');
    try {
      const { deployedServices } = await import('../../lib/services');
      const deployed = deployedServices(appConfig.services, appConfig.singleVM ?? false).map((svc) => svc.slug);
      const apps = await setupServiceApps({
        callerSecretKey: ctx.secretKey,
        projectId: ctx.projectId,
        slug: appConfig.slug,
        mode: context.environment,
        services: deployed,
      });
      serviceAppIds = apps.allAppIds;
    } catch (error) {
      console.warn(
        `${warningMark} Service app setup failed: ${errorMessage(error)}: the CI key-mint rule will be omitted; re-run "Rotate keys".`,
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
      ? {
          accessKey: ciKey.accessKey,
          secretKey: ciKey.secretKey,
          projectId: scwProjectId,
          organizationId: ciKey.organizationId,
        }
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

  printSummary({ needsCiKey, ciAccessKey: ciKey.accessKey, adminAppId });

  // Base infrastructure provisioning
  const canDeploy = context.hasCiKey || !!ciKey.accessKey;
  if (canDeploy) {
    console.info(`\n${pc.bold('Next: provision base infrastructure')} (registry, DB, network, no compute yet)`);
    // A fresh stack's first provision needs a local `pulumi up` with the bootstrap key because the CI key cannot create VPC/PN/RDB; afterwards CI runs `pulumi up` on push.
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
      // Only a fresh bootstrap still holds the CI key secret in memory; rotate and resume leave deploys to CI.
      if (isInitialBootstrap && ciKey.secretKey) {
        await offerFirstDeploy(ctx, ciKey, inputs);
      }
    } else {
      console.info(`  ${pc.dim('Recommended: re-run `pnpm infra` and choose "Resume" to retry.')}`);
      console.info('  Manual fallback if needed:');
      console.info(
        `  ${pc.cyan(`cd infra && SCW_ACCESS_KEY=<scw-access> SCW_SECRET_KEY=<scw-secret> AWS_ACCESS_KEY_ID=<scw-access> AWS_SECRET_ACCESS_KEY=<scw-secret> PULUMI_CONFIG_PASSPHRASE='<passphrase>' pulumi up --stack ${stackName}`)}`,
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
    // Revoking the bootstrap key is the last call because a key may delete itself; env-supplied keys under automation are never revoked.
    const revokeNow = nonInteractive()
      ? false
      : autoAcceptDefaults()
        ? true
        : await confirm({
            message: `Revoke the bootstrap key (${scwAccessKey}) now? Nothing else needs it; day-2 privileged actions ask for a fresh one.`,
            default: true,
          });
    if (revokeNow) {
      try {
        await withSpinner('Revoking bootstrap key', () => revokeApiKey(scwSecretKey, scwAccessKey));
        console.info(`${checkMark} Bootstrap key ${scwAccessKey} revoked.`);
      } catch (error) {
        console.warn(
          `${warningMark} Could not revoke the bootstrap key (${errorMessage(error)}). Delete it in the console: ${pc.underline('https://console.scaleway.com/iam/api-keys')}`,
        );
      }
    } else {
      console.info(
        `\n${pc.dim('Reminder:')} revoke the bootstrap key now, see ${pc.underline('infra/README.md')} → ${pc.italic('"Revoke the bootstrap key"')}`,
      );
    }
  }
}
