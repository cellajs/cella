import { spawnSync } from 'node:child_process'
import { confirm, input, password } from '@inquirer/prompts'
import pc from 'shared/cli-utils/colors'
import { warningMark } from 'shared/console'
import { adoptOrphanedPolicy } from '../../lib/adopt-orphaned-policy'
import { scwConfigPathNone } from '../../lib/bootstrap-scw-env'
import { infraDir } from '../../lib/paths'
import { runPulumiUpWithHint } from '../../lib/pulumi-up'
import { resolveOrganizationId } from '../../lib/scaleway-iam'
import { deriveInfra } from '../../naming'
import { type InfraContext, resolveVerifiedPassphrase } from '../shared'

/** One-shot `pulumi up` using a freshly-supplied bootstrap key passed via
 *  SCW_* env. For applying changes to bootstrap-owned resources (DB / VPC /
 *  private network) that the read-only CI key cannot make, without
 *  permanently widening CI permissions. Runs against an already-bootstrapped
 *  stack with live compute, so it must NOT defer compute (no computeDeferred
 *  marker) — that is reserved for the fresh-provision flow in setup.ts. */
export async function runApply(context: InfraContext): Promise<void> {
  if (context.state !== 'bootstrapped') {
    console.error(`${warningMark} "Apply infra change" requires a fully bootstrapped stack (state=${context.state}). Run Resume first.`)
    process.exit(1)
  }
  console.info(pc.dim('\nApply infra change: run pulumi up with a bootstrap key (supplied via env).\n'))

  const passphrase = await resolveVerifiedPassphrase(context.stackYaml)

  const projectId = process.env.SCW_DEFAULT_PROJECT_ID || process.env.SCW_PROJECT_ID || ''
  if (!projectId) {
    console.error(`${warningMark} Scaleway project ID not found. Set SCW_PROJECT_ID in the repo .env (see backend/.env.example).`)
    process.exit(1)
  }

  const bootAccess =
    process.env.SCW_BOOTSTRAP_ACCESS_KEY ||
    (await input({ message: 'Scaleway bootstrap access key', validate: (v) => !!v.trim() || '(required)' }))
  const bootSecret = process.env.SCW_BOOTSTRAP_SECRET_KEY || (await password({ message: 'Scaleway bootstrap secret key' }))

  const targetStack = await input({ message: 'Pulumi stack name', default: `organization/infra/${context.environment}` })

  if (!(await confirm({ message: `Swap stack creds to bootstrap key and run \`pulumi up\` on ${targetStack}?`, default: true }))) {
    console.info('Aborted; no changes made.')
    return
  }

  console.warn(
    `${pc.yellow(pc.bold('\u26A0  Keep this run in the foreground.'))} ${pc.dim('If it is interrupted, re-run "Apply infra change" to converge — `pulumi up` is idempotent.')}`,
  )

  const applyEnv: NodeJS.ProcessEnv = {
    ...process.env,
    SCW_ACCESS_KEY: bootAccess,
    SCW_SECRET_KEY: bootSecret,
    SCW_DEFAULT_PROJECT_ID: projectId,
    SCW_PROJECT_ID: projectId,
    AWS_ACCESS_KEY_ID: bootAccess,
    AWS_SECRET_ACCESS_KEY: bootSecret,
    PULUMI_CONFIG_PASSPHRASE: passphrase,
    SCW_CONFIG_PATH: scwConfigPathNone(infraDir),
    SCW_PROFILE: '',
  }

  const { appConfig } = context
  const loginUrl = `s3://${appConfig.slug}-pulumi-state?endpoint=s3.${appConfig.s3.region}.scw.cloud&region=${appConfig.s3.region}`
  spawnSync('pulumi', ['login', loginUrl], { cwd: infraDir, env: applyEnv, stdio: 'inherit' })
  spawnSync('pulumi', ['stack', 'select', targetStack], { cwd: infraDir, env: applyEnv, stdio: 'ignore' })

  // Resolve the organization id from the project so (a) it is set explicitly in
  // the env for the IAM policy create/update inside `pulumi up` (matching CI),
  // and (b) we can look up an existing IAM policy to adopt below. Non-fatal: if
  // it cannot be resolved the program still derives it from the project at
  // runtime, and policy adoption is skipped.
  let organizationId: string | undefined
  try {
    organizationId = await resolveOrganizationId(bootSecret, projectId)
    applyEnv.SCW_DEFAULT_ORGANIZATION_ID = organizationId
  } catch (error) {
    console.warn(`${warningMark} Could not resolve organization id (${(error as Error).message}); continuing without it.`)
  }

  // The VM reader IAM policy is Pulumi-managed but the original bootstrap created
  // it out-of-band, so it can be missing from Pulumi state — which makes
  // `pulumi up` try to create it and fail (409 locally / no IAM write in CI).
  // Adopt the pre-existing policy into state first; idempotent once imported.
  if (organizationId) {
    try {
      const policyName = deriveInfra(appConfig).naming.resource('vm-reader-policy')
      await adoptOrphanedPolicy({
        stack: targetStack,
        cwd: infraDir,
        env: applyEnv,
        pulumiName: 'vm-reader-policy',
        policyName,
        secretKey: bootSecret,
        organizationId,
      })
    } catch (error) {
      console.warn(`${warningMark} ${(error as Error).message}`)
    }
  }

  // No compute-deferred marker and no stack-file backup here: the stack is
  // already bootstrapped with live compute, the bootstrap key reaches
  // `pulumi up` via SCW_* env (applyEnv) rather than stack config, and
  // `pulumi up` is idempotent — an interrupted run is recovered simply by
  // re-running it. Deferring compute (as the fresh-provision flow does) would
  // tear down the running VMs/LB on an established stack.
  while (true) {
    const code = await runPulumiUpWithHint(targetStack, infraDir, applyEnv)
    if (code === 0) break
    if (!(await confirm({ message: 'Retry pulumi up?', default: false }))) break
  }

  console.info(`\n${pc.dim('Reminder:')} revoke the bootstrap key now (Scaleway console → IAM → API keys).`)
}