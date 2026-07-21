import { spawnSync } from 'node:child_process'
import { confirm, input } from '@inquirer/prompts'
import { pc } from 'shared/cli-utils/colors';
import { checkMark, crossMark, warningMark } from 'shared/utils/console'
import { adoptOrphanedPolicy } from '../../lib/scaleway/adopt-orphaned-policy'
import { adoptOrphanedSecrets } from '../../lib/scaleway/adopt-orphaned-secrets'
import { buildProviderEnv } from '../../lib/scaleway/bootstrap-scw-env'
import { resolveOrganizationId } from '../../lib/scaleway/scaleway-iam'
import { deriveInfra } from '../../lib/naming'
import { errorMessage } from '../../lib/utils/errors'
import { infraDir } from '../../lib/utils/paths'
import { parseOrphanedDeletes, pruneOrphanedDeletes, runPulumiUpWithHint } from '../../lib/stack/pulumi-up'
import { maskedSecret } from '../prompts/masked-secret'
import { acquireStackLockOrExit, envOr, type InfraContext, promptRequiredInput, promptStackName, pulumiLoginAndSelect, resolveVerifiedPassphrase } from '../shared'
import { parseAclInput } from './db-exposure-acl'

// Pulumi config keys consumed by resources/database.ts and the output it exports.
const DB_ENDPOINT_KEY = 'infra:dbPublicEndpoint'
const DB_ACL_KEY = 'infra:dbPublicAcl'
const PUBLIC_DSN_OUTPUT = 'dbConnectionStringAdminPublic'

/** Detect the operator's current public IPv4 via a well-known echo service. */
async function detectPublicIp(): Promise<string | undefined> {
  try {
    const res = await fetch('https://api.ipify.org', { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return undefined
    const body = (await res.text()).trim()
    return body || undefined
  } catch {
    return undefined
  }
}

/** Set one stack config key, exiting on failure. `secret` encrypts the value. */
function pulumiConfigSet(env: NodeJS.ProcessEnv, stack: string, key: string, value: string, opts: { secret?: boolean } = {}): void {
  const args = ['config', 'set', ...(opts.secret ? ['--secret'] : []), key, value, '--stack', stack]
  const result = spawnSync('pulumi', args, { cwd: infraDir, env, stdio: 'inherit' })
  if (result.status !== 0) {
    console.error(`${crossMark} pulumi config set ${key} failed (exit ${result.status}).`)
    process.exit(result.status ?? 1)
  }
}

/** Remove one stack config key. Best-effort: a missing key is not an error here. */
function pulumiConfigRm(env: NodeJS.ProcessEnv, stack: string, key: string): void {
  const result = spawnSync('pulumi', ['config', 'rm', key, '--stack', stack], { cwd: infraDir, env, stdio: 'inherit' })
  if (result.status !== 0) console.warn(`${warningMark} pulumi config rm ${key} exited ${result.status} (already unset?) — continuing.`)
}

/** Read the public admin DSN stack output (empty when the endpoint is disabled). */
function readPublicDsn(env: NodeJS.ProcessEnv, stack: string): string {
  const result = spawnSync('pulumi', ['stack', 'output', PUBLIC_DSN_OUTPUT, '--show-secrets', '--stack', stack], { cwd: infraDir, env, encoding: 'utf8' })
  return result.status === 0 ? (result.stdout ?? '').trim() : ''
}

/**
 * The privileged bootstrap-key converge shared by expose/unexpose: acquire keys
 * and the stack lock, adopt any orphaned IAM/secret state, reconcile rollout
 * config from live state (so a local `up` cannot revert compute to a stale
 * generation), apply the caller's config mutation, then run `pulumi up`. Returns
 * the provider env and stack so the caller can read outputs after the lock is
 * released. Exits the process on any hard failure.
 */
async function convergePublicEndpoint(
  context: InfraContext,
  operation: string,
  mutate: (env: NodeJS.ProcessEnv, stack: string) => void,
): Promise<{ env: NodeJS.ProcessEnv; stack: string }> {
  if (context.state !== 'bootstrapped') {
    console.error(`${warningMark} This action requires a fully bootstrapped stack (state=${context.state}). Run Resume first.`)
    process.exit(1)
  }

  const passphrase = await resolveVerifiedPassphrase(context.stackYaml)
  const { projectId, appConfig } = context

  const bootAccess = await envOr('SCW_BOOTSTRAP_ACCESS_KEY', () => promptRequiredInput('Scaleway bootstrap access key'))
  const bootSecret = await envOr('SCW_BOOTSTRAP_SECRET_KEY', () => maskedSecret({ message: 'Scaleway bootstrap secret key' }))
  const stack = await promptStackName(context)

  const env = buildProviderEnv(infraDir, { accessKey: bootAccess, secretKey: bootSecret, projectId, passphrase })
  pulumiLoginAndSelect(infraDir, env, appConfig, stack)

  const stackLock = await acquireStackLockOrExit({ appConfig, accessKey: bootAccess, secretKey: bootSecret, stack, operation })

  // Adopt IAM/secret state that exists in Scaleway but is missing from Pulumi
  // state, so `pulumi up` does not fail trying to recreate it. Best-effort,
  // exactly as the apply path does.
  try {
    const organizationId = await resolveOrganizationId(bootSecret, projectId)
    env.SCW_DEFAULT_ORGANIZATION_ID = organizationId
    const policyName = deriveInfra(appConfig).naming.resource('vm-reader-policy')
    await adoptOrphanedPolicy({ stack, cwd: infraDir, env, pulumiName: 'vm-reader-policy', policyName, secretKey: bootSecret, organizationId })
    await adoptOrphanedSecrets({ stack, cwd: infraDir, env, secretKey: bootSecret, projectId, region: appConfig.s3.region, path: `/${appConfig.slug}-${context.environment}/` })
  } catch (error) {
    console.warn(`${warningMark} orphan-state adoption skipped: ${errorMessage(error)}`)
  }

  // Reconcile gen/sha into local config from live state before `up`, so a stale
  // committed Pulumi.<stack>.yaml cannot converge compute back to an old
  // generation and destroy newer live VMs. A hard failure aborts.
  console.info(pc.dim('\n→ Reconciling rollout config from live state (sync-rollout-config)…'))
  const sync = spawnSync('pnpm', ['--filter', 'infra', 'sync-rollout-config', '--stack', stack], { cwd: infraDir, env, stdio: 'inherit' })
  if (sync.status !== 0) {
    await stackLock.release()
    console.error(`${warningMark} sync-rollout-config failed (exit ${sync.status}). Aborting to avoid applying against stale gen/sha.`)
    process.exit(sync.status ?? 1)
  }

  mutate(env, stack)

  while (true) {
    const { code, output } = await runPulumiUpWithHint(stack, infraDir, env)
    if (code === 0) break
    const orphans = parseOrphanedDeletes(output)
    if (orphans.length > 0 && (await confirm({ message: `Prune ${orphans.length} stale state entr${orphans.length === 1 ? 'y' : 'ies'} and retry?`, default: true }))) {
      pruneOrphanedDeletes(orphans, stack, infraDir, env)
      continue
    }
    if (!(await confirm({ message: 'Retry pulumi up?', default: false }))) {
      await stackLock.release()
      console.error(`${crossMark} converge did not complete; stack config may be partially applied. Re-run to finish.`)
      process.exit(1)
    }
  }

  await stackLock.release()
  return { env, stack }
}

/** Loud reminder to revoke the short-lived bootstrap key after the run. */
function revokeReminder(): void {
  console.info(`\n${pc.dim('Reminder:')} revoke the bootstrap key now (Scaleway console → IAM → API keys).`)
}

/**
 * Open the database's public endpoint for scoped operator access (prototyping,
 * debugging). Prompts for the client ACL (defaults to the operator's detected
 * /32), converges with a bootstrap key, then prints the admin DSN. The endpoint
 * is internet-reachable but restricted to the ACL; run "Stop public DB
 * exposure" when finished.
 */
export async function runExposeDatabase(context: InfraContext): Promise<void> {
  console.info(pc.dim('\nExpose database publicly: add a scoped, temporary public endpoint for operator tasks.\n'))

  const detected = await detectPublicIp()
  const suggestion = detected ? `${detected}/32` : ''
  if (detected) console.info(`Detected your public IP: ${pc.cyan(detected)} → default ACL ${pc.cyan(suggestion)}`)
  else console.warn(`${warningMark} Could not auto-detect your public IP; enter the client CIDR(s) manually.`)

  const raw = await input({
    message: 'Allowed client CIDR(s), comma-separated',
    default: suggestion || undefined,
    validate: (value) => {
      const parsed = parseAclInput(value)
      return parsed.ok || parsed.reason
    },
  })
  const parsed = parseAclInput(raw)
  if (!parsed.ok) {
    console.error(`${crossMark} ${parsed.reason}`)
    process.exit(1)
  }
  const acl = parsed.cidrs.join(',')

  console.warn(
    `\n${pc.yellow(pc.bold('⚠  This opens an internet-reachable database endpoint'))}, restricted to: ${pc.cyan(acl)}.\n` +
      `  ${pc.dim('The stack config file records the endpoint as enabled — do not commit it. Run "Stop public DB exposure" when done.')}\n`,
  )
  if (!(await confirm({ message: 'Proceed with exposing the database?', default: false }))) {
    console.info('Aborted; no changes made.')
    return
  }

  const { env, stack } = await convergePublicEndpoint(context, 'expose-db', (e, s) => {
    pulumiConfigSet(e, s, DB_ENDPOINT_KEY, 'true')
    // Encrypt the ACL: it records the operator's source IP and should not sit in
    // plaintext in the committed stack config.
    pulumiConfigSet(e, s, DB_ACL_KEY, acl, { secret: true })
  })

  const dsn = readPublicDsn(env, stack)
  if (!dsn) {
    console.warn(`${warningMark} Endpoint applied but no public DSN output yet — Scaleway may still be provisioning the load balancer. Re-run to read it.`)
  } else {
    console.info(`\n${checkMark} ${pc.bold('Database exposed.')} Admin connection string:\n\n    ${pc.cyan(dsn)}\n`)
    console.info(`  ${pc.dim('Example:')} psql "${dsn}"`)
  }
  console.info(`\n  ${pc.bold('When finished, run "Stop public DB exposure" to close it again.')}`)
  revokeReminder()
}

/**
 * Close the database's public endpoint: clears the opt-in config, tears down the
 * load balancer and ACL, and verifies the database is private-only again.
 */
export async function runUnexposeDatabase(context: InfraContext): Promise<void> {
  console.info(pc.dim('\nStop public DB exposure: remove the public endpoint and ACL, return to private-only.\n'))
  if (!(await confirm({ message: 'Close the public database endpoint now?', default: true }))) {
    console.info('Aborted; no changes made.')
    return
  }

  const { env, stack } = await convergePublicEndpoint(context, 'unexpose-db', (e, s) => {
    pulumiConfigSet(e, s, DB_ENDPOINT_KEY, 'false')
    pulumiConfigRm(e, s, DB_ACL_KEY)
  })

  const dsn = readPublicDsn(env, stack)
  if (dsn) {
    console.warn(`${warningMark} Public DSN output is still present — the endpoint may not have torn down. Re-run "Stop public DB exposure".`)
  } else {
    console.info(`\n${checkMark} ${pc.bold('Public endpoint closed.')} The database is private-only again.`)
  }
  revokeReminder()
}
