import { spawnSync } from 'node:child_process'
import { confirm, input, password } from '@inquirer/prompts'
import pc from 'shared/cli-utils/colors'
import { checkMark, warningMark } from 'shared/console'
import { extractProjectId } from '../lib/bootstrap-stack-state.js'
import { manualRestoreCommands, scwConfigPathNone, stripScwProviderEnv } from '../lib/bootstrap-scw-env.js'
import { ensureDnsZone } from '../lib/ensure-dns-zone.js'
import { ensureEdgePlan } from '../lib/ensure-edge-plan.js'
import { syncGithubEnvironment } from '../lib/github-sync.js'
import { decryptStackSecrets } from '../lib/pulumi-passphrase.js'
import { runPulumiUpWithHint } from '../lib/pulumi-up.js'
import { seedOperatorSecrets } from '../tasks/seed-operator-secrets.js'
import { setupCiKey } from '../tasks/setup-ci-key.js'
import type { BootstrapContext, Mode } from './shared.js'
import { createStepRunner, envOr, policyFingerprint } from './shared.js'

export async function runBootstrapMode(context: BootstrapContext, mode: Extract<Mode, 'resume' | 'rotate'>): Promise<void> {
  const needsCiKey = mode === 'rotate' || !context.hasCiKey
  const pulumiPassphrase = await envOr('PULUMI_CONFIG_PASSPHRASE', () => password({ message: 'Pulumi passphrase' }))

  let scwAccessKey = ''
  let scwSecretKey = ''
  let scwProjectId = ''
  if (context.stackYaml) {
    scwProjectId = extractProjectId(context.stackYaml) ?? ''
  }
  if (context.hasCiKey && mode === 'resume') {
    try {
      const decrypted = decryptStackSecrets(context.stackPath, pulumiPassphrase, ['scaleway:accessKey', 'scaleway:secretKey'])
      scwAccessKey = decrypted['scaleway:accessKey'] ?? ''
      scwSecretKey = decrypted['scaleway:secretKey'] ?? ''
      if (scwAccessKey && scwSecretKey && scwProjectId) {
        console.info(`${checkMark} Decrypted Scaleway creds from ${context.stackShort} stack (access key ${scwAccessKey})`)
      }
    } catch (error) {
      console.error(`${warningMark} Could not decrypt stored creds: ${(error as Error).message}. Falling back to manual entry.`)
    }
  }

  if (!scwAccessKey || !scwSecretKey || !scwProjectId) {
    const needsBootstrapKey = mode === 'rotate' || context.state === 'fresh' || !context.hasCiKey
    const role = needsBootstrapKey ? 'bootstrap (needs IAMManager)' : ''
    scwAccessKey ||= await envOr('SCW_BOOTSTRAP_ACCESS_KEY', () =>
      input({ message: `Scaleway ${role} access key`.trim(), validate: (value) => !!value.trim() || '(required)' }),
    )
    scwSecretKey ||= await envOr('SCW_BOOTSTRAP_SECRET_KEY', () => password({ message: `Scaleway ${role} secret key`.trim() }))
    scwProjectId ||= await envOr('SCW_DEFAULT_PROJECT_ID', () =>
      input({ message: 'Scaleway project ID', validate: (value) => !!value.trim() || '(required)' }),
    )
  }

  const needsStateBootstrapKey = context.hasCiKey && mode === 'resume'
  const stateAccessKey = needsStateBootstrapKey
    ? await envOr('SCW_BOOTSTRAP_ACCESS_KEY', () =>
        input({ message: 'Scaleway bootstrap access key (for Pulumi state bucket)', validate: (value) => !!value.trim() || '(required)' }),
      )
    : scwAccessKey
  const stateSecretKey = needsStateBootstrapKey
    ? await envOr('SCW_BOOTSTRAP_SECRET_KEY', () => password({ message: 'Scaleway bootstrap secret key (for Pulumi state bucket)' }))
    : scwSecretKey

  const stackName = await input({ message: 'Pulumi stack name', default: `organization/infra/${context.stackShort}` })
  const stackHas = (key: string) => !!context.stackYaml && new RegExp(`(^|\\n)\\s*${key.replace(':', ':\\s*')}\\s*:`).test(context.stackYaml)
  const adminEmail = stackHas('infra:adminEmail') ? '' : await input({ message: 'Admin email (optional)' })
  const brevoApiKey =
    !stackHas('infra:brevoApiKey') && adminEmail
      ? await password({ message: 'Brevo API key (optional)' }).catch(() => '')
      : ''
  const scwAiApiKey = stackHas('infra:scwAiApiKey')
    ? ''
    : await password({ message: 'Scaleway AI API key (optional, for the AI worker)' }).catch(() => '')

  if (!(await confirm({ message: `Proceed with ${mode}?`, default: true }))) process.exit(0)

  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    SCW_ACCESS_KEY: scwAccessKey,
    SCW_SECRET_KEY: scwSecretKey,
    SCW_DEFAULT_PROJECT_ID: scwProjectId,
    SCW_PROJECT_ID: scwProjectId,
    AWS_ACCESS_KEY_ID: stateAccessKey,
    AWS_SECRET_ACCESS_KEY: stateSecretKey,
    PULUMI_CONFIG_PASSPHRASE: pulumiPassphrase,
    SCW_CONFIG_PATH: scwConfigPathNone(context.infraDir),
    SCW_PROFILE: '',
  }

  const stateBucketEnv: NodeJS.ProcessEnv = {
    ...childEnv,
    SCW_ACCESS_KEY: stateAccessKey,
    SCW_SECRET_KEY: stateSecretKey,
  }

  const { must } = createStepRunner(context.infraDir, childEnv)

  await must('Ensure Pulumi state bucket', 'pnpm', ['ensure-state-bucket'], spawnSync, {
    retry: true,
    env: stateBucketEnv,
  })

  process.env.APP_MODE = process.env.APP_MODE ?? 'production'
  const { appConfig } = await import('shared')
  const loginUrl = `s3://${appConfig.slug}-pulumi-state?endpoint=s3.${appConfig.s3.region}.scw.cloud&region=${appConfig.s3.region}`
  await must('Pulumi login (S3 backend)', 'pulumi', ['login', loginUrl], spawnSync, { retry: true })

  const selected = spawnSync('pulumi', ['stack', 'select', stackName], { cwd: context.infraDir, env: childEnv, stdio: 'ignore' })
  if (selected.status === 0) {
    console.info(`\n→ Pulumi stack: ${stackName} (exists — selected)`)
  } else {
    await must('Pulumi stack init', 'pulumi', ['stack', 'init', stackName], spawnSync)
  }

  await must('Set scaleway:projectId', 'pulumi', ['config', 'set', 'scaleway:projectId', scwProjectId, '--stack', stackName], spawnSync)
  await must('Initialize stack secrets', 'pnpm', ['init-stack-secrets', stackName], spawnSync)

  const runtimeSecretPath = `/${appConfig.slug}-${context.stackShort}/`
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
  if (!adminEmail) {
    console.warn(`  ${warningMark} Required runtime secret admin-email is not set yet. Use "Manage runtime secrets" before deploying backend/ai.`)
  }

  let ciAccessKey = ''
  let ciSecretKey = ''
  let ciOrganizationId = ''
  let ciApplicationId = ''
  if (!needsCiKey) {
    console.info('\n→ CI deploy key — skipped (already in stack config)')
    const stored = context.stackYaml?.match(/(?:^|\n)\s*infra:ciPolicyFingerprint:\s*([^\s]+)/)?.[1]
    const expected = policyFingerprint()
    if (stored && stored !== expected) {
      console.warn(
        `  ${warningMark} CI policy permission sets have changed since the last Rotate ` +
          `(stored ${stored}, expected ${expected}). Re-run bootstrap and choose Rotate CI to apply.`,
      )
    }
  } else {
    while (true) {
      try {
        const key = await setupCiKey({ callerSecretKey: scwSecretKey, projectId: scwProjectId, slug: appConfig.slug })
        ciAccessKey = key.accessKey
        ciSecretKey = key.secretKey
        ciOrganizationId = key.organizationId
        ciApplicationId = key.applicationId
        break
      } catch (error) {
        console.error(`\n${warningMark} CI key setup failed: ${(error as Error).message}`)
        if (!(await confirm({ message: 'Retry?', default: true }))) break
      }
    }
  }

  if (ciAccessKey) {
    await must('Set infra:applicationId', 'pulumi', ['config', 'set', 'infra:applicationId', ciApplicationId, '--stack', stackName], spawnSync)
    await must('Set infra:ciPolicyFingerprint', 'pulumi', ['config', 'set', 'infra:ciPolicyFingerprint', policyFingerprint(), '--stack', stackName], spawnSync)
    try {
      const identityResponse = await fetch(`https://api.scaleway.com/iam/v1alpha1/api-keys/${scwAccessKey}`, {
        headers: { 'X-Auth-Token': scwSecretKey },
      })
      if (identityResponse.ok) {
        const identity = (await identityResponse.json()) as { user_id?: string; application_id?: string }
        const principal = identity.user_id
          ? `user_id:${identity.user_id}`
          : identity.application_id
            ? `application_id:${identity.application_id}`
            : ''
        if (principal) {
          await must('Set infra:operatorPrincipal', 'pulumi', ['config', 'set', 'infra:operatorPrincipal', principal, '--stack', stackName], spawnSync)
        }
      }
    } catch {
      console.warn(`  ${warningMark} Could not resolve operator principal; deploy-tags seed may 403 on a fresh stack.`)
    }
    if (context.state !== 'fresh') {
      await must('Set scaleway:accessKey', 'pulumi', ['config', 'set', '--secret', 'scaleway:accessKey', ciAccessKey, '--stack', stackName], spawnSync)
      await must('Set scaleway:secretKey', 'pulumi', ['config', 'set', '--secret', 'scaleway:secretKey', ciSecretKey, '--stack', stackName], spawnSync)
    }
  }

  await syncGithubEnvironment({
    repoRoot: new URL('..', `file://${context.infraDir}/`).pathname,
    stackShort: context.stackShort,
    ciKey: ciAccessKey ? { accessKey: ciAccessKey, secretKey: ciSecretKey, projectId: scwProjectId, organizationId: ciOrganizationId } : undefined,
  })

  const divider = pc.dim('─'.repeat(60))
  console.info(`\n${divider}`)
  if (!needsCiKey) {
    console.info(`${checkMark} ${pc.bold('Resume verified.')} CI key in stack config unchanged.`)
  } else if (ciAccessKey) {
    console.info(`${checkMark} ${pc.bold(pc.greenBright('Bootstrap complete.'))} CI deploy key: ${pc.cyanBright(ciAccessKey)}`)
  } else {
    console.info(`${warningMark} ${pc.bold(pc.yellowBright('Done, but CI key was not created.'))} Re-run and choose ${pc.italic('"Rotate CI"')}.`)
  }
  console.info(divider)

  const canDeploy = context.hasCiKey || !!ciAccessKey
  if (canDeploy) {
    console.info(`\n${pc.bold('Next: provision base infrastructure')} (registry, DB, network — no compute yet)`)
    const runNow = await confirm({ message: 'Run pulumi up now?', default: true })
    if (runNow) {
      try {
        await ensureEdgePlan({ secretKey: scwSecretKey, projectId: scwProjectId })
      } catch (error) {
        console.error(`\n${warningMark} Edge Services plan check failed: ${(error as Error).message}`)
        if (!(await confirm({ message: 'Continue with pulumi up anyway?', default: false }))) process.exit(1)
      }
      const { deriveInfra } = await import('../naming.js')
      const { domains: dnsDomains, hasDomain } = deriveInfra(appConfig)
      if (hasDomain) {
        try {
          await ensureDnsZone({ secretKey: scwSecretKey, projectId: scwProjectId, domain: dnsDomains.zone })
        } catch (error) {
          console.error(`\n${warningMark} DNS zone check failed: ${(error as Error).message}`)
          if (!(await confirm({ message: 'Continue with pulumi up anyway?', default: false }))) process.exit(1)
        }
      }
      const usingBootstrapKey = context.state === 'fresh'
      if (usingBootstrapKey) {
        console.info(`${pc.dim('  using bootstrap key for first provisioning (CI key has read-only on VPC/PN/RDB — cannot create them)')}`)
      }
      const pulumiUpEnv: NodeJS.ProcessEnv = usingBootstrapKey ? childEnv : stripScwProviderEnv(childEnv)
      if (usingBootstrapKey) {
        const startedAt = new Date().toISOString()
        spawnSync('pulumi', ['config', 'set', 'bootstrap:applyInProgress', startedAt, '--stack', stackName], {
          cwd: context.infraDir,
          env: pulumiUpEnv,
          stdio: 'inherit',
        })
      }
      let upOk = false
      while (true) {
        const code = await runPulumiUpWithHint(stackName, context.infraDir, pulumiUpEnv)
        if (code === 0) {
          upOk = true
          break
        }
        if (!(await confirm({ message: 'Retry?', default: true }))) process.exit(code)
      }
      if (usingBootstrapKey && upOk) {
        spawnSync('pulumi', ['config', 'rm', 'bootstrap:applyInProgress', '--stack', stackName], {
          cwd: context.infraDir,
          env: pulumiUpEnv,
          stdio: 'ignore',
        })
      }
      console.info(`\n${checkMark} Base infrastructure provisioned. Compute VMs will be deployed by CI after images are pushed.`)
      if (usingBootstrapKey && ciAccessKey) {
        await must('Set scaleway:accessKey', 'pulumi', ['config', 'set', '--secret', 'scaleway:accessKey', ciAccessKey, '--stack', stackName], spawnSync)
        await must('Set scaleway:secretKey', 'pulumi', ['config', 'set', '--secret', 'scaleway:secretKey', ciSecretKey, '--stack', stackName], spawnSync)
      }
    } else {
      console.info('  Re-run bootstrap any time to retry, or set the env vars manually:')
      console.info(
        `  ${pc.cyan(`cd infra && SCW_ACCESS_KEY=<scw-access> SCW_SECRET_KEY=<scw-secret> AWS_ACCESS_KEY_ID=<scw-access> AWS_SECRET_ACCESS_KEY=<scw-secret> PULUMI_CONFIG_PASSPHRASE='<passphrase>' pulumi up --stack ${stackName}`)}`,
      )
      if (context.state === 'fresh' && ciAccessKey) {
        console.info(`  ${pc.dim('After pulumi up succeeds, persist the CI key into stack config (the secret is shown only once):')}`)
        for (const line of manualRestoreCommands(stackName, ciAccessKey, ciSecretKey)) {
          console.info(`  ${pc.cyan(line)}`)
        }
      }
    }
  }
  if (needsCiKey && ciAccessKey) {
    console.info(`\n${pc.dim('Reminder:')} revoke the bootstrap key now — see ${pc.underline('infra/README.md')} → ${pc.italic('"Revoke the bootstrap key"')}`)
  }
}