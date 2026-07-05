import { spawnSync } from 'node:child_process'
import pc from 'shared/cli-utils/colors'
import { warningMark } from 'shared/console'
import { buildProviderEnv } from '../../lib/scaleway/bootstrap-scw-env'
import { infraDir } from '../../lib/utils/paths'
import { maskedSecret } from '../prompts/masked-secret'
import { envOr, type InfraContext, promptRequiredInput, promptStackName, pulumiLoginAndSelect, resolveVerifiedPassphrase } from '../shared'

/** Read-only `pulumi preview` against the stack. Authenticates the provider
 *  from SCW_* env (not stack config) using a Scaleway key supplied here, so it
 *  doubles as the validation that env-based auth resolves. Any key with read
 *  access works (CI deploy key or a bootstrap key). Never mutates anything. */
export async function runPreview(context: InfraContext): Promise<void> {
  if (context.state !== 'bootstrapped') {
    console.error(`${warningMark} "Preview" requires a fully bootstrapped stack (state=${context.state}). Run Resume first.`)
    process.exit(1)
  }
  console.info(pc.dim('\nPreview: read-only `pulumi preview` with a Scaleway key (supplied via env). No changes are made.\n'))

  const passphrase = await resolveVerifiedPassphrase(context.stackYaml)

  const { projectId } = context

  const accessKey = await envOr('SCW_ACCESS_KEY', () => promptRequiredInput('Scaleway access key (read access is enough)'))
  const secretKey = await envOr('SCW_SECRET_KEY', () => maskedSecret({ message: 'Scaleway secret key' }))

  const targetStack = await promptStackName(context)

  const previewEnv = buildProviderEnv(infraDir, { accessKey, secretKey, projectId, passphrase })

  const { appConfig } = context
  pulumiLoginAndSelect(infraDir, previewEnv, appConfig, targetStack)

  console.info(`\n→ pulumi preview\n  $ pulumi preview --stack ${targetStack} --diff`)
  const preview = spawnSync('pulumi', ['preview', '--stack', targetStack, '--diff'], { cwd: infraDir, env: previewEnv, stdio: 'inherit' })
  if (preview.status !== 0) {
    console.error(`\n${warningMark} pulumi preview exited ${preview.status}. Check provider auth (SCW_* env) and the passphrase.`)
    process.exit(preview.status ?? 1)
  }
  console.info(
    `\n${pc.dim('Provider auth resolved from SCW_* env (see the "Using: Environment variable" lines above). A clean "no changes" result means the stack matches code; any diff is real drift to reconcile via a deploy.')}`,
  )
}
