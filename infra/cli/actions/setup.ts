import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { confirm, select } from '@inquirer/prompts'
import { buildProviderEnv } from '../../lib/scaleway/bootstrap-scw-env'
import { createProject, listProjects, resolveOrganizationIdFromKey } from '../../lib/scaleway/scaleway-account'
import { ensureDnsZone } from '../../lib/scaleway/ensure-dns-zone'
import { writeEnvVar } from '../../lib/utils/env-file'
import { errorMessage } from '../../lib/utils/errors'
import { syncGithubEnvironment } from '../../lib/github-sync'
import { deriveInfra } from '../../lib/naming'
import { infraDir } from '../../lib/utils/paths'
import { ORG_PERMISSION_SETS, PROJECT_PERMISSION_SETS } from '../../lib/scaleway/permissions'
import { runPulumiUpWithHint } from '../../lib/stack/pulumi-up'
import { ensureBootstrapDnsGrant, resolveOrganizationId, revokeApiKey } from '../../lib/scaleway/scaleway-iam'
import { operatorManagedRuntimeSecrets } from '../../lib/runtime-secrets'
import { managedKeys, type ManagedKeyId } from '../../lib/managed-keys'
import { createSecretManagerClient } from '../../lib/scaleway/scaleway-secret-manager'
import { maskedSecret } from '../prompts/masked-secret'
import { secretManagerPath, VM_READER_SECRET_NAME } from '../../lib/scaleway/vm-reader-secret'
import { provisionManagedKey } from '../../tasks/provision-managed-key'
import { seedOperatorSecrets } from '../../tasks/seed-operator-secrets'
import { seedVmReaderKey } from '../../tasks/seed-vm-reader-key'
import { fetchAppPermissionSetsByName } from '../../tasks/assert-vm-grants'
import { setupCiKey } from '../../tasks/setup-ci-key'
import { setupOperatorApp } from '../../tasks/setup-operator-app'
import { setupVmKey } from '../../tasks/setup-vm-key'
import type { CliMode, InfraContext } from '../shared'
import { acquireStackLockOrExit, autoAcceptDefaults, confirmOrDefault, createStepRunner, envOr, inputOrDefault, nonInteractive, promptRequiredInput, promptStackName, pulumiLoginUrl, resolveOrCreatePassphrase } from '../shared'
import { pc, DIVIDER, changeMark, checkMark, failWithHint, warningMark, withSpinner } from '../../lib/utils/cli-output'

/** Everything the per-phase helpers below share. */
interface SetupContext {
  context: InfraContext
  appConfig: InfraContext['appConfig']
  projectId: string
  /** Operator bootstrap key (provider auth + IAM / Secret-Manager work). */
  accessKey: string
  secretKey: string
  stackName: string
  /** Secret Manager folder for this stack's runtime secrets. */
  runtimeSecretPath: string
  /** Child-process env carrying the provider credentials + passphrase. */
  childEnv: NodeJS.ProcessEnv
  must: ReturnType<typeof createStepRunner>['must']
}

/** Optional operator secret values gathered at the initial-bootstrap prompts. */
interface OperatorSecretValues {
  adminEmail: string
  brevoApiKey: string
}

/**
 * What the operator opted into at the initial-bootstrap prompts: which pasted
 * secret values to seed, and which managed keys (scoped Scaleway IAM keys) to
 * mint. Both are applied after the first `pulumi up`, once the containers exist.
 */
interface BootstrapSecretInputs {
  operatorSecrets: OperatorSecretValues
  /** Managed-key id → whether the operator asked to mint it now. */
  mintDecisions: Map<ManagedKeyId, boolean>
}

/** Result of the CI-deploy-key phase; empty strings when nothing was minted. */
interface CiKeyResult {
  accessKey: string
  secretKey: string
  organizationId: string
}

/**
 * Warn (read-only) about required operator-managed runtime secrets that still
 * have no value. Non-fatal: a brand-new project may not have the containers
 * yet, and the first `pulumi up` creates them.
 */
async function warnOnMissingOperatorSecrets(ctx: SetupContext): Promise<void> {
  try {
    const client = createSecretManagerClient({ secretKey: ctx.secretKey, region: ctx.appConfig.s3.region, projectId: ctx.projectId })
    const existing = await client.listSecrets(ctx.runtimeSecretPath)
    const versioned = new Set(existing.filter((secret) => (secret.version_count ?? 0) > 0).map((secret) => secret.name))
    const missing = operatorManagedRuntimeSecrets.filter((secret) => secret.required && !versioned.has(secret.secretName))
    if (missing.length > 0) {
      const services = [...new Set(missing.flatMap((secret) => secret.services))].join(', ')
      console.warn(
        `  ${warningMark} Required runtime secret(s) not set yet: ${missing.map((secret) => secret.secretName).join(', ')}. ` +
          `Use "Manage runtime secrets" before deploying ${services}.`,
      )
    }
  } catch {
    // Secret Manager unreachable (e.g. fresh project): skip the gap check.
  }
}

/** Advisory-only drift check of the live CI grant against the code-defined sets. */
async function warnOnCiPolicyDrift(ctx: SetupContext): Promise<void> {
  try {
    const liveSets = await fetchAppPermissionSetsByName({
      secretKey: ctx.secretKey,
      projectId: ctx.projectId,
      applicationName: `${ctx.appConfig.slug}-ci-deploy`,
    })
    if (!liveSets) return
    const expected: string[] = [...PROJECT_PERMISSION_SETS, ...ORG_PERMISSION_SETS].sort()
    const missing = expected.filter((s) => !liveSets.includes(s))
    const extra = liveSets.filter((s) => !expected.includes(s))
    if (missing.length || extra.length) {
      console.warn(
        `  ${warningMark} CI policy permission sets have drifted from code` +
          `${missing.length ? ` (missing: ${missing.join(', ')})` : ''}${extra.length ? ` (extra: ${extra.join(', ')})` : ''}. ` +
          `Re-run bootstrap and choose ${pc.italic('"Rotate keys"')} to reconcile.`,
      )
    }
  } catch {
    // IAM unreachable (e.g. fresh project): skip the advisory drift check.
  }
}

/** Mint (or rotate) the `<slug>-ci-deploy` key, retrying on operator confirm. */
async function mintCiKey(ctx: SetupContext): Promise<CiKeyResult> {
  while (true) {
    try {
      const key = await setupCiKey({ callerSecretKey: ctx.secretKey, projectId: ctx.projectId, slug: ctx.appConfig.slug, dnsZone: deriveInfra(ctx.appConfig).dnsZone })
      return { accessKey: key.accessKey, secretKey: key.secretKey, organizationId: key.organizationId }
    } catch (error) {
      console.error(`\n${warningMark} CI key setup failed: ${errorMessage(error)}`)
      if (nonInteractive() || !(await confirm({ message: 'Retry?', default: true }))) return { accessKey: '', secretKey: '', organizationId: '' }
    }
  }
}

/**
 * Ensures service VMs have a minimal-privilege reader key, minting one during setup
 * or when resume detects no versioned secret. Provisioning reuses the named IAM app,
 * so recovery rotates credentials without duplicating the identity. Lookup errors defer
 * validation to `pulumi up`; an empty result means no key was minted.
 */
async function ensureVmKey(ctx: SetupContext, needsCiKey: boolean): Promise<string> {
  let hasVmKey = false
  if (!needsCiKey) {
    try {
      const client = createSecretManagerClient({ secretKey: ctx.secretKey, region: ctx.appConfig.s3.region, projectId: ctx.projectId })
      const existing = await client.getSecretByName(VM_READER_SECRET_NAME, ctx.runtimeSecretPath)
      hasVmKey = (existing?.version_count ?? 0) > 0
    } catch {
      hasVmKey = true
    }
  }
  if (!needsCiKey && hasVmKey) return ''

  const vmCallerSecretKey = needsCiKey
    ? ctx.secretKey
    : await envOr('SCW_BOOTSTRAP_SECRET_KEY', () =>
        maskedSecret({ message: 'Scaleway bootstrap secret key (needs IAMManager — to provision the missing VM reader key)' }),
      )
  console.info('\n→ VM reader key (minimal-privilege identity for service VMs)')
  while (true) {
    try {
      const key = await setupVmKey({ callerSecretKey: vmCallerSecretKey, projectId: ctx.projectId, slug: ctx.appConfig.slug })
      // Store the key pair in Secret Manager so the Pulumi program can read
      // it back during `pulumi up` and bake it into VM cloud-init.
      await seedVmReaderKey({
        secretKey: vmCallerSecretKey,
        projectId: ctx.projectId,
        region: ctx.appConfig.s3.region,
        path: ctx.runtimeSecretPath,
        key: { accessKey: key.accessKey, secretKey: key.secretKey },
      })
      return key.accessKey
    } catch (error) {
      console.error(`\n${warningMark} VM key setup failed: ${errorMessage(error)}`)
      if (nonInteractive() || !(await confirm({ message: 'Retry?', default: true }))) return ''
    }
  }
}

/**
 * Operator IAM application, created on fresh/rotate (bootstrap key has
 * IAMManager). Grants Object Storage access so a key minted under it can
 * read/refresh the CI-scoped buckets (storage.ts OperatorAccess). No key is
 * minted; the dev makes one in the console. The app id is exported as
 * SCW_OPERATOR_APPLICATION_ID into backend/.env (idempotent: reuses the app and
 * only fills a blank id).
 */
async function ensureOperatorApp(ctx: SetupContext): Promise<string> {
  let operatorAppId = process.env.SCW_OPERATOR_APPLICATION_ID?.trim() ?? ''
  try {
    const op = await setupOperatorApp({ callerSecretKey: ctx.secretKey, projectId: ctx.projectId, slug: ctx.appConfig.slug })
    operatorAppId = op.applicationId
    if (!process.env.SCW_OPERATOR_APPLICATION_ID?.trim()) {
      writeEnvVar(resolve(infraDir, '..', 'backend', '.env'), 'SCW_OPERATOR_APPLICATION_ID', operatorAppId)
      process.env.SCW_OPERATOR_APPLICATION_ID = operatorAppId
    }
  } catch (error) {
    console.warn(`${warningMark} Operator app setup failed: ${errorMessage(error)}`)
  }
  return operatorAppId
}

function printSummary(opts: { needsCiKey: boolean; ciAccessKey: string; vmAccessKey: string; operatorAppId: string; mode: 'resume' | 'rotate' }): void {
  const { needsCiKey, ciAccessKey, vmAccessKey, operatorAppId, mode } = opts
  const divider = pc.dim(DIVIDER)
  console.info(`\n${divider}`)
  if (!needsCiKey) {
    console.info(`${checkMark} ${pc.bold('Resume verified.')} Existing deploy credentials left unchanged.`)
    if (vmAccessKey) {
      console.info(`  ${checkMark} Provisioned previously-missing VM reader key: ${pc.cyanBright(vmAccessKey)}`)
    }
  } else if (ciAccessKey && vmAccessKey) {
    console.info(`${checkMark} ${pc.bold(pc.greenBright('Bootstrap complete.'))} CI deploy key: ${pc.cyanBright(ciAccessKey)} · VM reader: ${pc.cyanBright(vmAccessKey)}`)
  } else if (ciAccessKey) {
    console.info(`${checkMark} ${pc.bold(pc.greenBright('Bootstrap complete.'))} CI deploy key: ${pc.cyanBright(ciAccessKey)}`)
    console.info(`  ${warningMark} VM reader key was not created. Re-run and choose ${pc.italic('"Rotate keys"')}.`)
  } else {
    console.info(`${warningMark} ${pc.bold(pc.yellowBright('Done, but CI key was not created.'))} Re-run and choose ${pc.italic('"Rotate keys"')}.`)
  }
  if (operatorAppId) {
    console.info(
      `  ${checkMark} Operator IAM app: ${pc.cyanBright(operatorAppId)} ${pc.dim('(SCW_OPERATOR_APPLICATION_ID, written to backend/.env)')}\n` +
        `    ${pc.dim('Create an operator API key under it for bucket/refresh access:')} ${pc.cyanBright('https://console.scaleway.com/iam/api-keys')}`,
    )
  }
  console.info(divider)

  // The VM reader IAM *policy* is Pulumi-managed (resources/vm-iam.ts), not minted
  // here. If a CI deploy fails with "insufficient permissions: write policy",
  // run "Apply infra change" once to adopt the existing Scaleway policy into state.
  if (mode === 'rotate' && vmAccessKey) {
    console.info(
      `  ${pc.dim(`Note: the VM reader IAM policy is reconciled by \`pulumi up\`. If a deploy reports ${pc.italic('"write policy"')}, run ${pc.italic('"Apply infra change"')} once to adopt it.`)}`,
    )
  }
}

/**
 * Mint the scoped Scaleway IAM keys the operator opted into at the bootstrap
 * prompts, now that `pulumi up` has created their (empty) runtime-secret
 * containers. Non-fatal per key: a mint failure warns and continues so one bad
 * key never blocks the rest of the bootstrap. It can be minted later via
 * "Manage runtime secrets".
 */
async function provisionConfirmedManagedKeys(ctx: SetupContext, mintDecisions: Map<ManagedKeyId, boolean>): Promise<void> {
  for (const key of managedKeys) {
    if (!mintDecisions.get(key.id)) continue
    console.info(`\n→ Minting ${key.label} key (${ctx.appConfig.slug}-${key.suffix})`)
    try {
      const result = await provisionManagedKey({
        definition: key,
        callerSecretKey: ctx.secretKey,
        projectId: ctx.projectId,
        region: ctx.appConfig.s3.region,
        slug: ctx.appConfig.slug,
        path: ctx.runtimeSecretPath,
      })
      console.info(`  ${checkMark} Minted ${key.label} ${pc.dim(`(app ${result.applicationId})`)}`)
    } catch (error) {
      console.warn(`  ${warningMark} ${key.label} mint failed: ${errorMessage(error)}. Mint later via "Manage runtime secrets".`)
    }
  }
}

/**
 * Validate DNS, lock the stack, defer fresh compute, and converge Pulumi.
 * Once secret containers exist, seed operator values and mint requested keys.
 */
async function provisionBaseInfra(ctx: SetupContext, inputs: BootstrapSecretInputs): Promise<void> {
  const { dnsZone, hasDomain } = deriveInfra(ctx.appConfig)
  if (hasDomain) {
    try {
      // Application-owned bootstrap keys need org-wide DNS before the first up
      // can write records in an org-shared zone (staging on the production apex).
      const organizationId = ctx.childEnv.SCW_DEFAULT_ORGANIZATION_ID
      if (organizationId) {
        await ensureBootstrapDnsGrant({
          callerSecretKey: ctx.secretKey,
          accessKey: ctx.accessKey,
          organizationId,
          slug: ctx.appConfig.slug,
        }).catch((error) => console.warn(`  ${warningMark} Bootstrap DNS grant skipped: ${errorMessage(error)}`))
      }
      await ensureDnsZone({ secretKey: ctx.secretKey, projectId: ctx.projectId, domain: dnsZone })
    } catch (error) {
      console.error(`\n${warningMark} DNS zone check failed: ${errorMessage(error)}`)
      if (!(await confirmOrDefault({ message: 'Continue with pulumi up anyway?', default: false }))) process.exit(1)
    }
  }

  // Lock provisioning against concurrent operators and CI.
  // Exit paths release it; abandoned locks expire or can be cleared with "Unlock".
  const stackLock = await acquireStackLockOrExit({
    appConfig: ctx.appConfig,
    accessKey: ctx.accessKey,
    secretKey: ctx.secretKey,
    stack: ctx.stackName,
    operation: 'setup',
  })

  const usingBootstrapKey = ctx.context.state === 'fresh'
  if (usingBootstrapKey) {
    console.info(`${pc.dim('  using bootstrap key for first provisioning (CI key has read-only on VPC/PN/RDB — cannot create them)')}`)
    // Fresh provision: no images exist yet, so compute is intentionally deferred
    // until CI pushes them (helpers gate on this marker).
    const startedAt = new Date().toISOString()
    spawnSync('pulumi', ['config', 'set', 'bootstrap:computeDeferred', startedAt, '--stack', ctx.stackName], {
      cwd: infraDir,
      env: ctx.childEnv,
      stdio: 'inherit',
    })
  }

  // The Scaleway provider authenticates from SCW_* env (set in childEnv).
  // On both fresh and resume runs that key is the operator bootstrap key.
  while (true) {
    const { code } = await runPulumiUpWithHint(ctx.stackName, infraDir, ctx.childEnv)
    if (code === 0) break
    if (nonInteractive() || !(await confirm({ message: 'Retry?', default: true }))) {
      await stackLock.release()
      failWithHint(`Base provisioning failed (pulumi up exited ${code})`, { command: 'pnpm infra', description: 'fix the cause above, then re-run and choose "Resume" to continue' }, code ?? 1)
    }
  }
  if (usingBootstrapKey) {
    spawnSync('pulumi', ['config', 'rm', 'bootstrap:computeDeferred', '--stack', ctx.stackName], {
      cwd: infraDir,
      env: ctx.childEnv,
      stdio: 'ignore',
    })
  }
  console.info(`\n${checkMark} Base infrastructure provisioned (no compute yet). The next deploy, local or CI, brings the VMs up.`)

  // Seed prompted values only after Pulumi creates the empty secret containers.
  // Empty values remain available through "Manage runtime secrets".
  await seedOperatorSecrets({
    secretKey: ctx.secretKey,
    projectId: ctx.projectId,
    region: ctx.appConfig.s3.region,
    path: ctx.runtimeSecretPath,
    values: {
      adminEmail: inputs.operatorSecrets.adminEmail || undefined,
      brevoApiKey: inputs.operatorSecrets.brevoApiKey || undefined,
    },
  })

  // Mint the scoped Scaleway IAM keys the operator opted into (containers now exist).
  await provisionConfirmedManagedKeys(ctx, inputs.mintDecisions)

  await stackLock.release()
}

/**
 * Pick or create the Scaleway project when none is configured yet, using the
 * bootstrap key. Lists the organization's projects for an interactive pick and
 * defaults to creating one named after the app slug (or selecting it when it
 * already exists). The chosen id is written to backend/.env as SCW_PROJECT_ID
 * so every later run resolves it without prompting. Non-interactive runs must
 * supply SCW_PROJECT_ID themselves.
 */
async function ensureProjectId(opts: { slug: string; accessKey: string; secretKey: string }): Promise<string> {
  if (nonInteractive()) {
    throw new Error('SCW_PROJECT_ID is not set. Non-interactive setup requires it in backend/.env or the environment.')
  }
  console.info(`\n→ Scaleway project ${pc.dim('(none configured yet)')}`)
  const { organizationId, projects } = await withSpinner('Loading Scaleway projects', async () => {
    const organizationId = await resolveOrganizationIdFromKey(opts.secretKey, opts.accessKey)
    return { organizationId, projects: await listProjects(opts.secretKey, organizationId) }
  })
  const CREATE = '__create__'
  const existing = projects.find((project) => project.name === opts.slug)
  const choice = await select<string>({
    message: 'Scaleway project for this stack',
    default: existing?.id ?? CREATE,
    loop: false,
    choices: [
      { name: `Create project "${opts.slug}"`, value: CREATE, description: 'Creates a fresh project in your organization.' },
      ...projects.map((project) => ({ name: `${project.name} ${pc.dim(`(${project.id})`)}`, value: project.id })),
    ],
  })
  let projectId = choice
  if (choice === CREATE) {
    const name = await inputOrDefault({ message: 'New project name', default: opts.slug })
    const project = await createProject(opts.secretKey, { organizationId, name, description: 'Created by the infra CLI setup wizard' })
    console.info(`  ${changeMark} Created project ${project.name} (${project.id})`)
    projectId = project.id
  }
  writeEnvVar(resolve(infraDir, '..', 'backend', '.env'), 'SCW_PROJECT_ID', projectId)
  process.env.SCW_PROJECT_ID = projectId
  console.info(`  ${checkMark} SCW_PROJECT_ID written to backend/.env`)
  return projectId
}

/**
 * Offer to run the first deploy right here, so a fresh setup ends with a live
 * app. Runs the exact one-command deploy CI runs, with --build (bakes images
 * locally via docker buildx), authenticated with the freshly minted CI deploy
 * key so the first deploy also proves the CI credential path. Skipped when
 * docker or a git HEAD is unavailable; declining prints the CI and manual
 * paths.
 */
async function offerFirstDeploy(ctx: SetupContext, ciKey: CiKeyResult, inputs: BootstrapSecretInputs): Promise<void> {
  const mode = ctx.context.environment
  const manualCmd = (sha: string) => `pnpm --filter infra run deploy --mode ${mode} --sha ${sha} --build`
  if (spawnSync('docker', ['buildx', 'version'], { stdio: 'ignore' }).status !== 0) {
    console.info(`\n${pc.dim('docker (with buildx) not found; skipping the first deploy. Run it later:')} ${pc.cyan(manualCmd('<git-sha>'))}`)
    return
  }
  const sha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: infraDir, encoding: 'utf8' }).stdout?.trim()
  if (!sha) {
    console.info(`\n${pc.dim('Could not resolve git HEAD; skipping the first deploy. Run it later:')} ${pc.cyan(manualCmd('<git-sha>'))}`)
    return
  }
  const hasAdminEmail = !!inputs.operatorSecrets.adminEmail
  if (!hasAdminEmail) {
    console.warn(
      `  ${warningMark} No admin email is set, and the deploy preflight requires the ${pc.bold('admin-email')} runtime secret.\n` +
        `    Set it first via "Manage runtime secrets", or the deploy will fail before rolling anything.`,
    )
  }
  const deployNow = nonInteractive()
    ? process.env.INFRA_DEPLOY_NOW === '1'
    : autoAcceptDefaults()
      ? hasAdminEmail
      : await confirm({ message: `Deploy ${sha.slice(0, 7)} to ${mode} now? Builds images locally, then rolls out (10-20 min).`, default: hasAdminEmail })
  if (!deployNow) {
    console.info(`  ${pc.dim('Deploy later from CI (publish a release / run the Deploy workflow) or locally:')} ${pc.cyan(manualCmd(sha))}`)
    return
  }
  // The exact env the GitHub Environment holds: CI deploy key as both the
  // provider and state-backend credentials, plus passphrase and project ids
  // (inherited from childEnv).
  const deployEnv: NodeJS.ProcessEnv = {
    ...ctx.childEnv,
    SCW_ACCESS_KEY: ciKey.accessKey,
    SCW_SECRET_KEY: ciKey.secretKey,
    AWS_ACCESS_KEY_ID: ciKey.accessKey,
    AWS_SECRET_ACCESS_KEY: ciKey.secretKey,
    ...(ciKey.organizationId ? { SCW_DEFAULT_ORGANIZATION_ID: ciKey.organizationId } : {}),
  }
  const { status } = spawnSync('pnpm', ['run', 'deploy', '--mode', mode, '--sha', sha, '--build'], { cwd: infraDir, env: deployEnv, stdio: 'inherit' })
  if (status === 0) {
    const { serviceEndpoints } = await import('../../lib/services')
    const frontendUrl = serviceEndpoints(ctx.appConfig).find((endpoint) => endpoint.slug === 'frontend')?.url
    console.info(`\n${checkMark} ${pc.bold(pc.greenBright('App is live.'))}${frontendUrl ? ` ${pc.underline(pc.cyanBright(frontendUrl))}` : ''}`)
    if (hasAdminEmail) console.info(`  ${pc.dim('Sign in by requesting a magic link for the admin email you provided.')}`)
  } else {
    console.warn(
      `\n${warningMark} First deploy failed (exit ${status}). Boot diagnostics were collected; inspect with ${pc.cyan('pnpm --filter infra diag')}.\n` +
        `  Re-running the same deploy is safe (generations are content-addressed): ${pc.cyan(manualCmd(sha))}`,
    )
  }
}

/**
 * Runs the first setup process for the infra CLI, including handling bootstrap keys, CI keys, and Pulumi stack configuration.
 */
export async function runSetup(context: InfraContext, mode: Extract<CliMode, 'resume' | 'rotate'>): Promise<void> {
  const needsCiKey = mode === 'rotate' || !context.hasCiKey
  const { passphrase: pulumiPassphrase, generated: passphraseGenerated } = await resolveOrCreatePassphrase(context.stackYaml)

  // Provider authentication and all IAM / Secret-Manager work use an operator
  // bootstrap key supplied here. The provider reads it from SCW_* env
  // (childEnv below), not from stack config.
  const scwAccessKey = await envOr('SCW_BOOTSTRAP_ACCESS_KEY', () => promptRequiredInput('Scaleway bootstrap access key'))
  const scwSecretKey = await envOr('SCW_BOOTSTRAP_SECRET_KEY', () => maskedSecret({ message: 'Scaleway bootstrap secret key' }))
  const scwProjectId =
    context.projectId || (await ensureProjectId({ slug: context.appConfig.slug, accessKey: scwAccessKey, secretKey: scwSecretKey }))

  const stackName = await promptStackName(context)

  // Prompt for operator secrets and managed-key decisions only on initial bootstrap.
  // Keys are minted after their first infrastructure update creates the containers; resume and
  // rotation report missing values without prompting. Declined values remain manageable later.
  const isInitialBootstrap = !context.hasCiKey
  const inputs: BootstrapSecretInputs = {
    operatorSecrets: { adminEmail: '', brevoApiKey: '' },
    mintDecisions: new Map<ManagedKeyId, boolean>(),
  }
  if (isInitialBootstrap) {
    inputs.operatorSecrets.adminEmail = await inputOrDefault({ message: 'Admin email (optional, set later via "Manage runtime secrets")', envName: 'INFRA_ADMIN_EMAIL' })
    inputs.operatorSecrets.brevoApiKey =
      inputs.operatorSecrets.adminEmail && !nonInteractive() ? await maskedSecret({ message: 'Brevo API key (optional)' }).catch(() => '') : ''
    for (const key of managedKeys) {
      inputs.mintDecisions.set(key.id, await confirmOrDefault({ message: key.prompt.message, default: key.prompt.default }))
    }
  }

  const modeLabel = mode === 'rotate' ? 'Rotate keys' : 'Resume'
  if (!(await confirmOrDefault({ message: `Proceed with ${modeLabel}?`, default: true }))) process.exit(0)

  // The bootstrap key also holds the object-storage rights needed for the
  // Pulumi state bucket, so it doubles as the state-backend credential pair.
  const childEnv = buildProviderEnv(infraDir, {
    accessKey: scwAccessKey,
    secretKey: scwSecretKey,
    projectId: scwProjectId,
    passphrase: pulumiPassphrase,
    stateAccessKey: scwAccessKey,
    stateSecretKey: scwSecretKey,
  })

  // The Pulumi program requires SCW_DEFAULT_ORGANIZATION_ID (pulumi-context.ts
  // requireEnv); CI injects it from its secrets and "Apply infra change"
  // resolves it the same way, so resolve it here too for the provisioning `up`.
  try {
    childEnv.SCW_DEFAULT_ORGANIZATION_ID = await resolveOrganizationId(scwSecretKey, scwProjectId)
  } catch (error) {
    console.warn(`${warningMark} Could not resolve organization id (${errorMessage(error)}); \`pulumi up\` will fail without SCW_DEFAULT_ORGANIZATION_ID in the environment.`)
  }

  const stateBucketEnv: NodeJS.ProcessEnv = {
    ...childEnv,
    SCW_ACCESS_KEY: scwAccessKey,
    SCW_SECRET_KEY: scwSecretKey,
  }

  const { must } = createStepRunner(infraDir, childEnv)
  const { appConfig } = context
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
  }

  // State backend + stack
  await must('Ensure Pulumi state bucket', 'pnpm', ['ensure-state-bucket'], spawnSync, { retry: true, env: stateBucketEnv })
  await must('Pulumi login (S3 backend)', 'pulumi', ['login', pulumiLoginUrl(appConfig)], spawnSync, { retry: true })
  const selected = spawnSync('pulumi', ['stack', 'select', stackName], { cwd: infraDir, env: childEnv, stdio: 'ignore' })
  if (selected.status === 0) {
    console.info(`\n→ Pulumi stack: ${stackName} (exists — selected)`)
  } else {
    await must('Pulumi stack init', 'pulumi', ['stack', 'init', stackName], spawnSync)
  }

  // Seed operator secret values after the first `pulumi up`; Pulumi owns their containers.
  // The pre-apply gap check is read-only.
  if (!inputs.operatorSecrets.adminEmail) await warnOnMissingOperatorSecrets(ctx)

  // Identities: CI deploy key, VM reader key, operator app
  let ciKey: CiKeyResult = { accessKey: '', secretKey: '', organizationId: '' }
  if (needsCiKey) {
    ciKey = await mintCiKey(ctx)
  } else {
    console.info('\n→ CI deploy key — skipped (already in stack config)')
    await warnOnCiPolicyDrift(ctx)
  }

  const vmAccessKey = await ensureVmKey(ctx, needsCiKey)
  const operatorAppId = needsCiKey ? await ensureOperatorApp(ctx) : (process.env.SCW_OPERATOR_APPLICATION_ID?.trim() ?? '')

  // Identity ids (applicationId, vmApplicationId, operatorPrincipal) are derived
  // from the IAM API and the VM reader key lives in Secret Manager, so stack
  // config only needs a non-secret bootstrap marker.
  const bootstrapComplete = context.hasCiKey || !!ciKey.accessKey
  if (bootstrapComplete) {
    await must('Mark bootstrap complete', 'pulumi', ['config', 'set', 'infra:bootstrapComplete', new Date().toISOString(), '--stack', stackName], spawnSync)
  }

  // The passphrase is synced on every run (idempotent): it is verified against
  // the stack above, so this self-heals a missing or drifted
  // PULUMI_CONFIG_PASSPHRASE environment secret.
  const synced = await syncGithubEnvironment({
    repoRoot: new URL('..', `file://${infraDir}/`).pathname,
    environment: context.environment,
    ciKey: ciKey.accessKey ? { accessKey: ciKey.accessKey, secretKey: ciKey.secretKey, projectId: scwProjectId, organizationId: ciKey.organizationId } : undefined,
    passphrase: pulumiPassphrase,
  })
  if (!synced) {
    console.warn(
      `\n${warningMark} GitHub sync skipped (gh not authenticated or origin is not a GitHub remote).\n` +
        `  Add the Environment secrets manually${passphraseGenerated ? ` — including the just-generated ${pc.bold('PULUMI_CONFIG_PASSPHRASE')}` : ''} (see the secrets table in infra/README.md).`,
    )
  }

  printSummary({ needsCiKey, ciAccessKey: ciKey.accessKey, vmAccessKey, operatorAppId, mode })

  // Base infrastructure provisioning
  const canDeploy = context.hasCiKey || !!ciKey.accessKey
  if (canDeploy) {
    console.info(`\n${pc.bold('Next: provision base infrastructure')} (registry, DB, network — no compute yet)`)
    // First provision (fresh stack) needs a local `pulumi up` with the bootstrap
    // key: the CI key can't create VPC/PN/RDB. After that, the recommended path
    // is to let CI run `pulumi up` on push, so default to skipping it here.
    const isFirstProvision = context.state === 'fresh'
    if (!isFirstProvision) {
      console.info(
        `  ${pc.dim('Recommended: push to the deploy branch and let CI run `pulumi up` (this local run is only needed for out-of-band changes).')}`,
      )
    }
    const runNow = await confirmOrDefault({ message: isFirstProvision ? 'Run the recommended first pulumi up now?' : 'Run pulumi up now?', default: isFirstProvision })
    if (runNow) {
      await provisionBaseInfra(ctx, inputs)
      // Fresh bootstrap with the CI key secret still in memory: finish with a
      // live app. Rotate/resume runs skip this; CI owns their deploys.
      if (isInitialBootstrap && ciKey.secretKey) {
        await offerFirstDeploy(ctx, ciKey, inputs)
      }
    } else {
      console.info(`  ${pc.dim('Recommended: re-run `pnpm infra` and choose "Resume" to retry.')}`)
      console.info('  Manual fallback if needed:')
      console.info(
        `  ${pc.cyan(`cd infra && SCW_ACCESS_KEY=<scw-access> SCW_SECRET_KEY=<scw-secret> AWS_ACCESS_KEY_ID=<scw-access> AWS_SECRET_ACCESS_KEY=<scw-secret> PULUMI_CONFIG_PASSPHRASE='<passphrase>' pulumi up --stack ${stackName}`)}`,
      )
    }
  }
  if (needsCiKey && ciKey.accessKey) {
    // The wizard no longer needs the bootstrap key, so offer to revoke it as
    // the last call (a key may delete itself). Declining falls back to the
    // manual reminder; env-supplied keys under automation are never revoked.
    const revokeNow = nonInteractive()
      ? false
      : autoAcceptDefaults()
        ? true
        : await confirm({ message: `Revoke the bootstrap key (${scwAccessKey}) now? Nothing else needs it; day-2 privileged actions ask for a fresh one.`, default: true })
    if (revokeNow) {
      try {
        await withSpinner('Revoking bootstrap key', () => revokeApiKey(scwSecretKey, scwAccessKey))
        console.info(`${checkMark} Bootstrap key ${scwAccessKey} revoked.`)
      } catch (error) {
        console.warn(
          `${warningMark} Could not revoke the bootstrap key (${errorMessage(error)}). Delete it in the console: ${pc.underline('https://console.scaleway.com/iam/api-keys')}`,
        )
      }
    } else {
      console.info(`\n${pc.dim('Reminder:')} revoke the bootstrap key now — see ${pc.underline('infra/README.md')} → ${pc.italic('"Revoke the bootstrap key"')}`)
    }
  }
}
