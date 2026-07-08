import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { confirm, input } from '@inquirer/prompts'
import { pc } from 'shared/cli-utils/colors';
import { DIVIDER } from 'shared/cli-utils/display'
import { checkMark, warningMark } from 'shared/console'
import { buildProviderEnv } from '../../lib/scaleway/bootstrap-scw-env'
import { ensureDnsZone } from '../../lib/scaleway/ensure-dns-zone'
import { writeEnvVar } from '../../lib/utils/env-file'
import { errorMessage } from '../../lib/utils/errors'
import { syncGithubEnvironment } from '../../lib/github-sync'
import { deriveInfra } from '../../lib/naming'
import { infraDir } from '../../lib/utils/paths'
import { ORG_PERMISSION_SETS, PROJECT_PERMISSION_SETS } from '../../lib/scaleway/permissions'
import { runPulumiUpWithHint } from '../../lib/stack/pulumi-up'
import { operatorManagedRuntimeSecrets } from '../../lib/runtime-secrets'
import { createSecretManagerClient } from '../../lib/scaleway/scaleway-secret-manager'
import { maskedSecret } from '../prompts/masked-secret'
import { secretManagerPath, VM_READER_SECRET_NAME } from '../../lib/scaleway/vm-reader-secret'
import { seedOperatorSecrets } from '../../tasks/seed-operator-secrets'
import { seedVmReaderKey } from '../../tasks/seed-vm-reader-key'
import { fetchAppPermissionSetsByName } from '../../tasks/assert-vm-grants'
import { setupCiKey } from '../../tasks/setup-ci-key'
import { setupOperatorApp } from '../../tasks/setup-operator-app'
import { setupVmKey } from '../../tasks/setup-vm-key'
import type { CliMode, InfraContext } from '../shared'
import { acquireStackLockOrExit, createStepRunner, envOr, promptRequiredInput, promptStackName, pulumiLoginUrl, resolveVerifiedPassphrase } from '../shared'

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
  scwAiApiKey: string
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
      const key = await setupCiKey({ callerSecretKey: ctx.secretKey, projectId: ctx.projectId, slug: ctx.appConfig.slug })
      return { accessKey: key.accessKey, secretKey: key.secretKey, organizationId: key.organizationId }
    } catch (error) {
      console.error(`\n${warningMark} CI key setup failed: ${errorMessage(error)}`)
      if (!(await confirm({ message: 'Retry?', default: true }))) return { accessKey: '', secretKey: '', organizationId: '' }
    }
  }
}

/**
 * VM reader key: minimal-privilege identity baked into service VMs. Provisioned
 * alongside the CI key on fresh/rotate, OR on its own to self-heal a stack that
 * is missing it (a plain Resume). provisionScopedKey is idempotent: it reuses
 * the `<slug>-vm-reader` app by name and just mints a fresh key, so a repeated
 * heal rotates rather than duplicates. Minting the IAM app requires a key with
 * IAMManager: on fresh/rotate the bootstrap key already is one; on a plain
 * Resume prompt for a bootstrap key just for this step.
 *
 * A Resume re-mints only when no versioned `vm-reader-key` secret exists. On a
 * Secret Manager error we assume the key is present to avoid an unnecessary
 * rotation; a real miss fails later at `pulumi up`. Returns the new access key
 * ('' when nothing was minted).
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
      if (!(await confirm({ message: 'Retry?', default: true }))) return ''
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
 * Base-infra provisioning: DNS zone check, stack lock, computeDeferred marker
 * on a fresh provision, the `pulumi up` retry loop, and the first-value seed
 * for operator secrets gathered at the prompts.
 */
async function provisionBaseInfra(ctx: SetupContext, values: OperatorSecretValues): Promise<void> {
  const { dnsZone, hasDomain } = deriveInfra(ctx.appConfig)
  if (hasDomain) {
    try {
      await ensureDnsZone({ secretKey: ctx.secretKey, projectId: ctx.projectId, domain: dnsZone })
    } catch (error) {
      console.error(`\n${warningMark} DNS zone check failed: ${errorMessage(error)}`)
      if (!(await confirm({ message: 'Continue with pulumi up anyway?', default: false }))) process.exit(1)
    }
  }

  // Lock the stack for the provisioning phase (pulumi up + image bake) so a
  // second operator or a CI deploy cannot mutate concurrently. Released at
  // the provisioning exit points below; a dead lock self-expires (TTL) or is
  // cleared via the CLI "Unlock" action.
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
    const code = await runPulumiUpWithHint(ctx.stackName, infraDir, ctx.childEnv)
    if (code === 0) break
    if (!(await confirm({ message: 'Retry?', default: true }))) {
      await stackLock.release()
      process.exit(code)
    }
  }
  if (usingBootstrapKey) {
    spawnSync('pulumi', ['config', 'rm', 'bootstrap:computeDeferred', '--stack', ctx.stackName], {
      cwd: infraDir,
      env: ctx.childEnv,
      stdio: 'ignore',
    })
  }
  console.info(`\n${checkMark} Base infrastructure provisioned. Compute VMs will be deployed by CI after images are pushed.`)

  // Pulumi has now created the (empty) operator secret containers, so write
  // the first VERSION for any values gathered at the prompt. Doing this here
  // after `up` so a fresh fork does not fail with "secret already exists".
  // Empty/undefined values are skipped and can be
  // set later via "Manage runtime secrets".
  await seedOperatorSecrets({
    secretKey: ctx.secretKey,
    projectId: ctx.projectId,
    region: ctx.appConfig.s3.region,
    path: ctx.runtimeSecretPath,
    values: {
      adminEmail: values.adminEmail || undefined,
      brevoApiKey: values.brevoApiKey || undefined,
      scwAiApiKey: values.scwAiApiKey || undefined,
    },
  })

  await stackLock.release()
}

/**
 * Runs the first setup process for the infra CLI, including handling bootstrap keys, CI keys, and Pulumi stack configuration.
 */
export async function runSetup(context: InfraContext, mode: Extract<CliMode, 'resume' | 'rotate'>): Promise<void> {
  const needsCiKey = mode === 'rotate' || !context.hasCiKey
  const pulumiPassphrase = await resolveVerifiedPassphrase(context.stackYaml)

  // Provider authentication and all IAM / Secret-Manager work use an operator
  // bootstrap key supplied here. The provider reads it from SCW_* env
  // (childEnv below), not from stack config.
  const scwProjectId = context.projectId
  const scwAccessKey = await envOr('SCW_BOOTSTRAP_ACCESS_KEY', () => promptRequiredInput('Scaleway bootstrap access key'))
  const scwSecretKey = await envOr('SCW_BOOTSTRAP_SECRET_KEY', () => maskedSecret({ message: 'Scaleway bootstrap secret key' }))

  const stackName = await promptStackName(context)

  // Operator-managed runtime secrets (admin email, Brevo, AI key) live in
  // Scaleway Secret Manager and are owned by "Manage runtime secrets", not stack
  // config. Only offer to seed them on the very first bootstrap so the first
  // deploy works without a second step; on an already-bootstrapped stack we skip
  // the prompts entirely (Resume/Rotate shouldn't re-ask) and instead warn below
  // about any required ones still missing.
  const isInitialBootstrap = !context.hasCiKey
  const values: OperatorSecretValues = { adminEmail: '', brevoApiKey: '', scwAiApiKey: '' }
  if (isInitialBootstrap) {
    values.adminEmail = await input({ message: 'Admin email (optional, set later via "Manage runtime secrets")' })
    values.brevoApiKey = values.adminEmail ? await maskedSecret({ message: 'Brevo API key (optional)' }).catch(() => '') : ''
    values.scwAiApiKey = await maskedSecret({ message: 'Scaleway AI API key (optional, for the AI worker)' }).catch(() => '')
  }

  const modeLabel = mode === 'rotate' ? 'Rotate keys' : 'Resume'
  if (!(await confirm({ message: `Proceed with ${modeLabel}?`, default: true }))) process.exit(0)

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

  // -- State backend + stack --------------------------------------------------
  await must('Ensure Pulumi state bucket', 'pnpm', ['ensure-state-bucket'], spawnSync, { retry: true, env: stateBucketEnv })
  await must('Pulumi login (S3 backend)', 'pulumi', ['login', pulumiLoginUrl(appConfig)], spawnSync, { retry: true })
  const selected = spawnSync('pulumi', ['stack', 'select', stackName], { cwd: infraDir, env: childEnv, stdio: 'ignore' })
  if (selected.status === 0) {
    console.info(`\n→ Pulumi stack: ${stackName} (exists — selected)`)
  } else {
    await must('Pulumi stack init', 'pulumi', ['stack', 'init', stackName], spawnSync)
  }

  // Operator secret VALUES are seeded AFTER the first `pulumi up` (in
  // provisionBaseInfra), not here. Pulumi owns the secret containers
  // (resources/secrets.ts), so creating them out-of-band before `up` would make
  // `pulumi up` fail with "secret already exists" on a fresh fork. The gap check
  // is read-only, so it is safe to run before `up`.
  if (!values.adminEmail) await warnOnMissingOperatorSecrets(ctx)

  // -- Identities: CI deploy key, VM reader key, operator app ------------------
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

  await syncGithubEnvironment({
    repoRoot: new URL('..', `file://${infraDir}/`).pathname,
    environment: context.environment,
    ciKey: ciKey.accessKey ? { accessKey: ciKey.accessKey, secretKey: ciKey.secretKey, projectId: scwProjectId, organizationId: ciKey.organizationId } : undefined,
  })

  printSummary({ needsCiKey, ciAccessKey: ciKey.accessKey, vmAccessKey, operatorAppId, mode })

  // -- Base infrastructure provisioning ----------------------------------------
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
    const runNow = await confirm({ message: isFirstProvision ? 'Run the recommended first pulumi up now?' : 'Run pulumi up now?', default: isFirstProvision })
    if (runNow) {
      await provisionBaseInfra(ctx, values)
    } else {
      console.info(`  ${pc.dim('Recommended: re-run `pnpm infra` and choose "Resume" to retry.')}`)
      console.info('  Manual fallback if needed:')
      console.info(
        `  ${pc.cyan(`cd infra && SCW_ACCESS_KEY=<scw-access> SCW_SECRET_KEY=<scw-secret> AWS_ACCESS_KEY_ID=<scw-access> AWS_SECRET_ACCESS_KEY=<scw-secret> PULUMI_CONFIG_PASSPHRASE='<passphrase>' pulumi up --stack ${stackName}`)}`,
      )
    }
  }
  if (needsCiKey && ciKey.accessKey) {
    console.info(`\n${pc.dim('Reminder:')} revoke the bootstrap key now — see ${pc.underline('infra/README.md')} → ${pc.italic('"Revoke the bootstrap key"')}`)
  }
}
