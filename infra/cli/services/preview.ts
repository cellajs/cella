import { spawnSync } from 'node:child_process'
import { input, password } from '@inquirer/prompts'
import pc from 'shared/cli-utils/colors'
import { warningMark } from 'shared/console'
import { scwConfigPathNone } from '../../lib/bootstrap-scw-env'
import { infraDir } from '../../lib/paths'
import { type InfraContext, resolveVerifiedPassphrase } from '../shared'

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

  const projectId = process.env.SCW_DEFAULT_PROJECT_ID || process.env.SCW_PROJECT_ID || ''
  if (!projectId) {
    console.error(`${warningMark} Scaleway project ID not found. Set SCW_PROJECT_ID in the repo .env (see backend/.env.example).`)
    process.exit(1)
  }

  const accessKey =
    process.env.SCW_ACCESS_KEY ||
    (await input({ message: 'Scaleway access key (read access is enough)', validate: (v) => !!v.trim() || '(required)' }))
  const secretKey = process.env.SCW_SECRET_KEY || (await password({ message: 'Scaleway secret key' }))

  const targetStack = await input({ message: 'Pulumi stack name', default: `organization/infra/${context.environment}` })

  const previewEnv: NodeJS.ProcessEnv = {
    ...process.env,
    SCW_ACCESS_KEY: accessKey,
    SCW_SECRET_KEY: secretKey,
    SCW_DEFAULT_PROJECT_ID: projectId,
    SCW_PROJECT_ID: projectId,
    AWS_ACCESS_KEY_ID: accessKey,
    AWS_SECRET_ACCESS_KEY: secretKey,
    PULUMI_CONFIG_PASSPHRASE: passphrase,
    SCW_CONFIG_PATH: scwConfigPathNone(infraDir),
    SCW_PROFILE: '',
  }

  const { appConfig } = context
  const loginUrl = `s3://${appConfig.slug}-pulumi-state?endpoint=s3.${appConfig.s3.region}.scw.cloud&region=${appConfig.s3.region}`
  spawnSync('pulumi', ['login', loginUrl], { cwd: infraDir, env: previewEnv, stdio: 'inherit' })
  spawnSync('pulumi', ['stack', 'select', targetStack], { cwd: infraDir, env: previewEnv, stdio: 'ignore' })

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
