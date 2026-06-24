import { spawnSync } from 'node:child_process'
import { confirm, input } from '@inquirer/prompts'
import pc from 'shared/cli-utils/colors'
import { DIVIDER } from 'shared/cli-utils/display'
import { checkMark, warningMark } from 'shared/console'
import { buildProviderEnv } from '../../lib/bootstrap-scw-env'
import { ensureDnsZone } from '../../lib/ensure-dns-zone'
import { syncGithubEnvironment } from '../../lib/github-sync'
import { infraDir } from '../../lib/paths'
import { ORG_PERMISSION_SETS, PROJECT_PERMISSION_SETS } from '../../lib/permissions'
import { runPulumiUpWithHint } from '../../lib/pulumi-up'
import { operatorManagedRuntimeSecrets } from '../../lib/runtime-secrets'
import { createSecretManagerClient } from '../../lib/scaleway-secret-manager'
import { maskedSecret } from '../prompts/masked-secret'
import { VM_READER_SECRET_NAME } from '../../lib/vm-reader-secret'
import { seedOperatorSecrets } from '../../tasks/seed-operator-secrets'
import { seedVmReaderKey } from '../../tasks/seed-vm-reader-key'
import { fetchAppPermissionSetsByName } from '../../tasks/assert-vm-grants'
import { setupCiKey } from '../../tasks/setup-ci-key'
import { setupVmKey } from '../../tasks/setup-vm-key'
import type { CliMode, InfraContext } from '../shared'
import { createStepRunner, envOr, resolveVerifiedPassphrase } from '../shared'

/**
 * Runs the first setup process for the infra CLI, including handling bootstrap keys, CI keys, and Pulumi stack configuration.
 */
export async function runSetup(context: InfraContext, mode: Extract<CliMode, 'resume' | 'rotate'>): Promise<void> {
  const needsCiKey = mode === 'rotate' || !context.hasCiKey
  const pulumiPassphrase = await resolveVerifiedPassphrase(context.stackYaml)

  // Provider authentication and all IAM / Secret-Manager work use an operator
  // bootstrap key supplied here. The CI deploy key is no longer stored in stack
  // config (it lives only in GitHub secrets, minted once and unrecoverable), so
  // it cannot be decrypted and reused — every interactive setup run authenticates
  // with a freshly-pasted bootstrap key. The provider reads it from SCW_* env
  // (childEnv below), not from stack config.
  const scwProjectId = context.projectId
  const scwAccessKey = await envOr('SCW_BOOTSTRAP_ACCESS_KEY', () =>
    input({ message: 'Scaleway bootstrap access key', validate: (value) => !!value.trim() || '(required)' }),
  )
  const scwSecretKey = await envOr('SCW_BOOTSTRAP_SECRET_KEY', () => maskedSecret({ message: 'Scaleway bootstrap secret key' }))

  // The bootstrap key above also holds the object-storage rights needed for the
  // Pulumi state bucket, so reuse it rather than prompting for a second key.
  const stateAccessKey = scwAccessKey
  const stateSecretKey = scwSecretKey

	const stackName = await input({ message: 'Pulumi stack name', default: `organization/infra/${context.environment}` })

  // Operator-managed runtime secrets (admin email, Brevo, AI key) live in
  // Scaleway Secret Manager and are owned by "Manage runtime secrets", not stack
  // config. Only offer to seed them on the very first bootstrap so the first
  // deploy works without a second step; on an already-bootstrapped stack we skip
  // the prompts entirely (Resume/Rotate shouldn't re-ask) and instead warn below
  // about any required ones still missing.
  const isInitialBootstrap = !context.hasCiKey
  let adminEmail = ''
  let brevoApiKey = ''
  let scwAiApiKey = ''
  if (isInitialBootstrap) {
    adminEmail = await input({ message: 'Admin email (optional, set later via "Manage runtime secrets")' })
    brevoApiKey = adminEmail ? await maskedSecret({ message: 'Brevo API key (optional)' }).catch(() => '') : ''
    scwAiApiKey = await maskedSecret({ message: 'Scaleway AI API key (optional, for the AI worker)' }).catch(() => '')
  }

  const modeLabel = mode === 'rotate' ? 'Rotate keys' : 'Resume'
  if (!(await confirm({ message: `Proceed with ${modeLabel}?`, default: true }))) process.exit(0)

  const childEnv = buildProviderEnv(infraDir, {
    accessKey: scwAccessKey,
    secretKey: scwSecretKey,
    projectId: scwProjectId,
    passphrase: pulumiPassphrase,
    stateAccessKey,
    stateSecretKey,
  })

  const stateBucketEnv: NodeJS.ProcessEnv = {
    ...childEnv,
    SCW_ACCESS_KEY: stateAccessKey,
    SCW_SECRET_KEY: stateSecretKey,
  }

  const { must } = createStepRunner(infraDir, childEnv)

  await must('Ensure Pulumi state bucket', 'pnpm', ['ensure-state-bucket'], spawnSync, {
    retry: true,
    env: stateBucketEnv,
  })

  const { appConfig } = context
  const loginUrl = `s3://${appConfig.slug}-pulumi-state?endpoint=s3.${appConfig.s3.region}.scw.cloud&region=${appConfig.s3.region}`
  await must('Pulumi login (S3 backend)', 'pulumi', ['login', loginUrl], spawnSync, { retry: true })

  const selected = spawnSync('pulumi', ['stack', 'select', stackName], { cwd: infraDir, env: childEnv, stdio: 'ignore' })
  if (selected.status === 0) {
    console.info(`\n→ Pulumi stack: ${stackName} (exists — selected)`)
  } else {
    await must('Pulumi stack init', 'pulumi', ['stack', 'init', stackName], spawnSync)
  }

  const runtimeSecretPath = `/${appConfig.slug}-${context.environment}/`

  // Operator secret VALUES are seeded AFTER the first `pulumi up` (in the
  // provisioning block below), not here. Pulumi now owns the secret containers
  // (resources/secrets.ts), so creating them out-of-band before `up` would make
  // `pulumi up` fail with "secret already exists" on a fresh fork. The gap check
  // below is read-only, so it is safe to run before `up`.
  if (!adminEmail) {
    // Accurate gap check: query Secret Manager for required operator-managed
    // runtime secrets that still have no value, rather than inferring from this
    // run's prompts. Non-fatal — a brand-new project may not have the containers
    // yet, and the first `pulumi up` creates them.
    try {
      const client = createSecretManagerClient({ secretKey: scwSecretKey, region: appConfig.s3.region, projectId: scwProjectId })
      const existing = await client.listSecrets(runtimeSecretPath)
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
      // Secret Manager unreachable (e.g. fresh project) — skip the gap check.
    }
  }

  let ciAccessKey = ''
  let ciSecretKey = ''
  let ciOrganizationId = ''
  if (!needsCiKey) {
    console.info('\n→ CI deploy key — skipped (already in stack config)')
    // Compare the live `<slug>-ci-deploy` grant against the code-defined
    // permission sets. This is advisory only, so IAM issues never block setup.
    try {
      const liveSets = await fetchAppPermissionSetsByName({
        secretKey: scwSecretKey,
        projectId: scwProjectId,
        applicationName: `${appConfig.slug}-ci-deploy`,
      })
      if (liveSets) {
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
      }
    } catch {
      // IAM unreachable (e.g. fresh project) — skip the advisory drift check.
    }
  } else {
    while (true) {
      try {
        const key = await setupCiKey({ callerSecretKey: scwSecretKey, projectId: scwProjectId, slug: appConfig.slug })
        ciAccessKey = key.accessKey
        ciSecretKey = key.secretKey
        ciOrganizationId = key.organizationId
        break
      } catch (error) {
        console.error(`\n${warningMark} CI key setup failed: ${(error as Error).message}`)
        if (!(await confirm({ message: 'Retry?', default: true }))) break
      }
    }
  }

  // VM reader key — minimal-privilege identity baked into service VMs. Provisioned
  // alongside the CI key on fresh/rotate, OR on its own to self-heal a stack that
  // is missing it (needsVmKey on a plain Resume). provisionScopedKey is idempotent:
  // it reuses the `<slug>-vm-reader` app by name and just mints a fresh key, so a
  // repeated heal rotates rather than duplicates. Minting the IAM app requires a
  // key with IAMManager: on fresh/rotate scwSecretKey already is a bootstrap key;
  // on a plain Resume prompt for a bootstrap key just for this step.
  //
  // A Resume re-mints only when no versioned `vm-reader-key` secret exists.
  // On a Secret Manager error we assume the key is present to avoid an
  // unnecessary rotation; a real miss fails later at `pulumi up`.
  let hasVmKey = false
  if (!needsCiKey) {
    try {
      const client = createSecretManagerClient({ secretKey: scwSecretKey, region: appConfig.s3.region, projectId: scwProjectId })
      const existing = await client.getSecretByName(VM_READER_SECRET_NAME, runtimeSecretPath)
      hasVmKey = (existing?.version_count ?? 0) > 0
    } catch {
      hasVmKey = true
    }
  }
  const needsVmKey = needsCiKey || !hasVmKey
  let vmAccessKey = ''
  if (needsVmKey) {
    const vmCallerSecretKey = needsCiKey
      ? scwSecretKey
      : await envOr('SCW_BOOTSTRAP_SECRET_KEY', () =>
          maskedSecret({ message: 'Scaleway bootstrap secret key (needs IAMManager — to provision the missing VM reader key)' }),
        )
    console.info('\n→ VM reader key (minimal-privilege identity for service VMs)')
    while (true) {
      try {
        const key = await setupVmKey({ callerSecretKey: vmCallerSecretKey, projectId: scwProjectId, slug: appConfig.slug })
        vmAccessKey = key.accessKey
        // Store the key pair in Secret Manager so the Pulumi program can read
        // it back during `pulumi up` and bake it into VM cloud-init.
        await seedVmReaderKey({
          secretKey: vmCallerSecretKey,
          projectId: scwProjectId,
          region: appConfig.s3.region,
          path: runtimeSecretPath,
          key: { accessKey: key.accessKey, secretKey: key.secretKey },
        })
        break
      } catch (error) {
        console.error(`\n${warningMark} VM key setup failed: ${(error as Error).message}`)
        if (!(await confirm({ message: 'Retry?', default: true }))) break
      }
    }
  }

  // Identity ids (applicationId, vmApplicationId, operatorPrincipal) are derived
  // from the IAM API and the VM reader key lives in Secret Manager, so stack
  // config only needs a non-secret bootstrap marker.
  const bootstrapComplete = context.hasCiKey || !!ciAccessKey
  if (bootstrapComplete) {
    await must(
      'Mark bootstrap complete',
      'pulumi',
      ['config', 'set', 'infra:bootstrapComplete', new Date().toISOString(), '--stack', stackName],
      spawnSync,
    )
  }

  await syncGithubEnvironment({
    repoRoot: new URL('..', `file://${infraDir}/`).pathname,
    environment: context.environment,
    ciKey: ciAccessKey ? { accessKey: ciAccessKey, secretKey: ciSecretKey, projectId: scwProjectId, organizationId: ciOrganizationId } : undefined,
  })

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
  console.info(divider)

  // The VM reader IAM *policy* is Pulumi-managed (resources/vm-iam.ts), not minted
  // here. After rotating, if a CI deploy fails with "insufficient permissions:
  // write policy" the policy exists in Scaleway but not in Pulumi state — run
  // "Apply infra change" once to adopt it (it imports the policy automatically).
  if (mode === 'rotate' && vmAccessKey) {
    console.info(
      `  ${pc.dim(`Note: the VM reader IAM policy is reconciled by \`pulumi up\`. If a deploy reports ${pc.italic('"write policy"')}, run ${pc.italic('"Apply infra change"')} once to adopt it.`)}`,
    )
  }

  const canDeploy = context.hasCiKey || !!ciAccessKey
  if (canDeploy) {
    console.info(`\n${pc.bold('Next: provision base infrastructure')} (registry, DB, network — no compute yet)`)
    // First provision (fresh stack) needs a local `pulumi up` with the bootstrap
    // key — the CI key can't create VPC/PN/RDB. After that, the recommended path
    // is to let CI run `pulumi up` on push, so default to skipping it here.
    const isFirstProvision = context.state === 'fresh'
    if (!isFirstProvision) {
      console.info(
        `  ${pc.dim('Recommended: push to the deploy branch and let CI run `pulumi up` (this local run is only needed for out-of-band changes).')}`,
      )
    }
    const runNow = await confirm({ message: isFirstProvision ? 'Run the recommended first pulumi up now?' : 'Run pulumi up now?', default: isFirstProvision })
    if (runNow) {
      const { deriveInfra } = await import('../../lib/naming')
      const { dnsZone, hasDomain } = deriveInfra(appConfig)
      if (hasDomain) {
        try {
          await ensureDnsZone({ secretKey: scwSecretKey, projectId: scwProjectId, domain: dnsZone })
        } catch (error) {
          console.error(`\n${warningMark} DNS zone check failed: ${(error as Error).message}`)
          if (!(await confirm({ message: 'Continue with pulumi up anyway?', default: false }))) process.exit(1)
        }
      }
      // Lock the stack for the provisioning phase (pulumi up + image bake) so a
      // second operator or a CI deploy cannot mutate concurrently. Released at
      // the provisioning exit points below; a dead lock self-expires (TTL) or is
      // cleared via the CLI "Unlock" action.
      const { acquireLock, controlActor, lockKey, makeControlClient, releaseLock, stateBucket } = await import('../../lib/control-store')
      const lockS3 = await makeControlClient(appConfig.s3.region, scwAccessKey, scwSecretKey)
      const lockBucket = stateBucket(appConfig.slug)
      const lockObjectKey = lockKey(stackName)
      const lockOwner = controlActor()
      const releaseSetupLock = () =>
        releaseLock(lockS3, lockBucket, lockObjectKey, lockOwner).catch((e) => console.warn(`${warningMark} failed to release stack lock: ${(e as Error).message}`))
      const stackLock = await acquireLock(lockS3, lockBucket, lockObjectKey, { owner: lockOwner, operation: 'setup', ttlMs: 30 * 60_000 })
      if (!stackLock.acquired) {
        console.error(`${warningMark} Stack ${stackName} is locked by ${pc.cyan(stackLock.held.owner)} (operation: ${stackLock.held.operation}, since ${stackLock.held.acquiredAt}). Use the CLI "Unlock" action if that run is dead.`)
        process.exit(1)
      }

      const usingBootstrapKey = context.state === 'fresh'
      if (usingBootstrapKey) {
        console.info(`${pc.dim('  using bootstrap key for first provisioning (CI key has read-only on VPC/PN/RDB — cannot create them)')}`)
      }
      // The Scaleway provider authenticates from SCW_* env (set in childEnv).
      // On both fresh and resume runs that key is the operator bootstrap key.
      const pulumiUpEnv: NodeJS.ProcessEnv = childEnv
      if (usingBootstrapKey) {
        const startedAt = new Date().toISOString()
        spawnSync('pulumi', ['config', 'set', 'bootstrap:computeDeferred', startedAt, '--stack', stackName], {
          cwd: infraDir,
          env: pulumiUpEnv,
          stdio: 'inherit',
        })
      }
      let upOk = false
      while (true) {
        const code = await runPulumiUpWithHint(stackName, infraDir, pulumiUpEnv)
        if (code === 0) {
          upOk = true
          break
        }
        if (!(await confirm({ message: 'Retry?', default: true }))) {
          await releaseSetupLock()
          process.exit(code)
        }
      }
      if (usingBootstrapKey && upOk) {
        spawnSync('pulumi', ['config', 'rm', 'bootstrap:computeDeferred', '--stack', stackName], {
          cwd: infraDir,
          env: pulumiUpEnv,
          stdio: 'ignore',
        })
      }
      console.info(`\n${checkMark} Base infrastructure provisioned. Compute VMs will be deployed by CI after images are pushed.`)

      // Pulumi has now created the (empty) operator secret containers, so write
      // the first VERSION for any values gathered at the prompt. Doing this here
      // — rather than before `up` — is what keeps a fresh fork from failing with
      // "secret already exists". Empty/undefined values are skipped and can be
      // set later via "Manage runtime secrets".
      await seedOperatorSecrets({
        secretKey: scwSecretKey,
        projectId: scwProjectId,
        region: appConfig.s3.region,
        path: runtimeSecretPath,
        values: {
          adminEmail: adminEmail || undefined,
          brevoApiKey: brevoApiKey || undefined,
          scwAiApiKey: scwAiApiKey || undefined,
        },
      })

      await releaseSetupLock()
    } else {
      console.info(`  ${pc.dim('Recommended: re-run `pnpm infra` and choose "Resume" to retry.')}`)
      console.info('  Manual fallback if needed:')
      console.info(
        `  ${pc.cyan(`cd infra && SCW_ACCESS_KEY=<scw-access> SCW_SECRET_KEY=<scw-secret> AWS_ACCESS_KEY_ID=<scw-access> AWS_SECRET_ACCESS_KEY=<scw-secret> PULUMI_CONFIG_PASSPHRASE='<passphrase>' pulumi up --stack ${stackName}`)}`,
      )
    }
  }
  if (needsCiKey && ciAccessKey) {
    console.info(`\n${pc.dim('Reminder:')} revoke the bootstrap key now — see ${pc.underline('infra/README.md')} → ${pc.italic('"Revoke the bootstrap key"')}`)
  }
}