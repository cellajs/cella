import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pc } from 'shared/cli-utils/colors';
import { checkMark, crossMark, warningMark } from 'shared/utils/console'
import { syncGithubEnvironment } from '../../lib/github-sync'
import { buildProviderEnv } from '../../lib/scaleway/bootstrap-scw-env'
import { generatePassphrase, supportsStdinPassphraseRotation, verifyStackPassphrase } from '../../lib/stack/pulumi-passphrase'
import { infraDir } from '../../lib/utils/paths'
import { maskedSecret } from '../prompts/masked-secret'
import { acquireStackLockOrExit, confirmPassphraseStored, envOr, type InfraContext, promptRequiredInput, promptStackName, pulumiLoginAndSelect, resolveVerifiedPassphrase } from '../shared'

/**
 * Rotate the stack's Pulumi passphrase: verify the current one, generate a new
 * one (shown once), re-encrypt state via `pulumi stack change-secrets-provider
 * passphrase` (old passphrase in env, new one piped on stdin: supported since
 * pulumi v3.44.0), verify the rewritten stack yaml, and sync the new value to
 * the GitHub Environment. Runs under the stack lock so a CI deploy cannot read
 * state mid-re-encryption. Touches no Scaleway resources, so any key with
 * state-bucket access works: no bootstrap key needed.
 */
export async function runRotatePassphrase(context: InfraContext): Promise<void> {
  if (!context.stackYaml || !/^encryptionsalt:/m.test(context.stackYaml)) {
    console.error(`${warningMark} "Rotate passphrase" requires an existing stack with encrypted state (state=${context.state}). A fresh bootstrap generates its own passphrase.`)
    process.exit(1)
  }

  const versionOutput = spawnSync('pulumi', ['version'], { encoding: 'utf8' }).stdout?.trim() ?? ''
  if (!supportsStdinPassphraseRotation(versionOutput)) {
    console.error(`${crossMark} pulumi ${versionOutput} cannot rotate a passphrase non-interactively — v3.44.0 or newer is required. Upgrade: brew upgrade pulumi`)
    process.exit(1)
  }

  console.info(
    pc.dim(
      '\nRotate passphrase: re-encrypts the stack state and Pulumi.<stack>.yaml with a freshly generated passphrase, then syncs it to GitHub. No Scaleway resources are touched; any key with state-bucket access works (no bootstrap key needed).\n',
    ),
  )

  const oldPassphrase = await resolveVerifiedPassphrase(context.stackYaml)

  const accessKey = await envOr('SCW_ACCESS_KEY', () => promptRequiredInput('Scaleway access key (state-bucket access is enough)'))
  const secretKey = await envOr('SCW_SECRET_KEY', () => maskedSecret({ message: 'Scaleway secret key' }))
  const targetStack = await promptStackName(context)

  const env = buildProviderEnv(infraDir, { accessKey, secretKey, projectId: context.projectId, passphrase: oldPassphrase })
  pulumiLoginAndSelect(infraDir, env, context.appConfig, targetStack)

  // Hold the stack lock across the re-encryption: a CI deploy reading state
  // mid-rotation would decrypt against the wrong passphrase.
  const stackLock = await acquireStackLockOrExit({
    appConfig: context.appConfig,
    accessKey,
    secretKey,
    stack: targetStack,
    operation: 'rotate-passphrase',
  })

  // Shown and stored BEFORE the rotation runs: if this process dies right
  // after `change-secrets-provider`, the state must never be encrypted with a
  // passphrase nobody has seen.
  const newPassphrase = generatePassphrase()
  await confirmPassphraseStored(newPassphrase, `New Pulumi passphrase ${pc.dim('(takes effect after the re-encryption below)')}`)

  console.info(`\n→ Re-encrypt stack secrets\n  $ pulumi stack change-secrets-provider passphrase --stack ${targetStack} ${pc.dim('(new passphrase piped on stdin)')}`)
  const rotate = spawnSync('pulumi', ['stack', 'change-secrets-provider', 'passphrase', '--stack', targetStack, '--non-interactive'], {
    cwd: infraDir,
    env,
    input: `${newPassphrase}\n`,
    stdio: ['pipe', 'inherit', 'inherit'],
  })
  if (rotate.status !== 0) {
    await stackLock.release()
    console.error(`\n${crossMark} change-secrets-provider exited ${rotate.status}. The stack most likely still uses the OLD passphrase — verify before changing GitHub or your password manager.`)
    process.exit(rotate.status ?? 1)
  }

  // Post-check: the rewritten stack yaml must decrypt with the new passphrase.
  const stackShort = targetStack.split('/').pop() ?? context.environment
  const stackPath = resolve(infraDir, `Pulumi.${stackShort}.yaml`)
  let rotatedYaml: string
  try {
    rotatedYaml = readFileSync(stackPath, 'utf8')
  } catch {
    await stackLock.release()
    console.error(`${crossMark} Could not read ${stackPath} after rotation. Verify manually which passphrase the stack now uses before updating anything else.`)
    process.exit(1)
  }
  if (!verifyStackPassphrase(rotatedYaml, newPassphrase)) {
    await stackLock.release()
    console.error(`${crossMark} Post-check failed: ${stackPath} does not verify against the new passphrase. Do not update GitHub or discard the old passphrase; investigate before retrying.`)
    process.exit(1)
  }
  console.info(`${checkMark} Stack re-encrypted — ${pc.cyan(`Pulumi.${stackShort}.yaml`)} verifies against the new passphrase.`)

  const synced = await syncGithubEnvironment({
    repoRoot: new URL('..', `file://${infraDir}/`).pathname,
    environment: context.environment,
    passphrase: newPassphrase,
  })

  await stackLock.release()

  console.info(`\n${checkMark} ${pc.bold(pc.greenBright('Passphrase rotated.'))}`)
  console.info(`  1. Commit the updated ${pc.cyan(`infra/Pulumi.${stackShort}.yaml`)} (the encryptionsalt changed).`)
  console.info(
    synced
      ? `  2. GitHub Environment secret ${pc.bold('PULUMI_CONFIG_PASSPHRASE')} updated.`
      : `  2. ${warningMark} GitHub sync skipped — update ${pc.bold('PULUMI_CONFIG_PASSPHRASE')} in the ${context.environment} GitHub Environment before the next deploy.`,
  )
  console.info(`  ${pc.dim('A CI deploy started before this rotation may fail once; re-run it after updating the secret.')}`)
}
