/**
 * Interactive bootstrap for the Pulumi/Scaleway infra. Safe to re-run.
 * Inspects the local Pulumi stack file to decide whether this is a fresh
 * fork or an existing setup, then offers a mode menu. Credentials live in
 * memory only — never written to disk. See infra/README.md.
 *
 * Usage: pnpm --filter infra bootstrap
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { confirm, input, password, select } from '@inquirer/prompts'
import pc from 'shared/cli-utils/colors'
import { printHeader } from 'shared/cli-utils/display'
import { checkMark, warningMark } from 'shared/console'
import { detectInterruptedApply, detectStackState, extractProjectId, pickStackShort } from '../src/bootstrap-parsing.js'
import { manualRestoreCommands, scwConfigPathNone, stripScwProviderEnv } from '../src/bootstrap-helpers.js'
import { ensureDnsZone } from '../src/ensure-dns-zone.js'
import { ensureEdgePlan } from '../src/ensure-edge-plan.js'
import { syncGithubEnvironment } from '../src/github-sync.js'
import { decryptStackSecrets } from '../src/pulumi-passphrase.js'
import { runPulumiUpWithHint } from '../src/pulumi-up.js'
import { manageRuntimeSecrets } from './manage-runtime-secrets.js'
import { migrateRuntimeSecrets } from './migrate-runtime-secrets.js'
import { ORG_PERMISSION_SETS, PROJECT_PERMISSION_SETS, setupCiKey } from './setup-ci-key.js'

/** Short hash of the permission sets the CI policy *should* have. Stored in stack config
 *  so Resume can detect when this script's constants changed since the last Rotate. */
const policyFingerprint = () =>
  createHash('sha1')
    .update(JSON.stringify([[...PROJECT_PERMISSION_SETS].sort(), [...ORG_PERMISSION_SETS].sort()]))
    .digest('hex')
    .slice(0, 12)

const infraDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')

printHeader('infra bootstrap')

if (spawnSync('pulumi', ['version'], { stdio: 'ignore' }).status !== 0) {
  console.error('✗ pulumi CLI not found. Install: brew install pulumi/tap/pulumi')
  process.exit(1)
}

// Detect prior state from the local Pulumi stack file (purely local).
type Mode = 'resume' | 'rotate' | 'apply' | 'clean' | 'secrets'
const stackShort = pickStackShort((n) => existsSync(resolve(infraDir, `Pulumi.${n}.yaml`)))
const stackPath = resolve(infraDir, `Pulumi.${stackShort}.yaml`)
const stackYaml = existsSync(stackPath) ? readFileSync(stackPath, 'utf8') : undefined
const state = detectStackState({ yamlText: stackYaml })
const hasCiKey = state === 'bootstrapped'

console.info(`State: ${state}${state === 'fresh' ? '' : ` (Pulumi.${stackShort}.yaml)`}\n`)

// Two redundant traces are written by apply-mode before swapping the CI key
// out, and removed after restore:
//   1. Local sentinel file `.apply-in-progress.<stack>.lock` (gitignored).
//   2. Plaintext config marker `bootstrap:applyInProgress: <iso>` in the
//      Pulumi stack YAML — visible in `git diff`, survives across machines.
// Either trace on a subsequent run means a previous Apply was interrupted
// between swap and restore, so stack credentials likely point at a
// (now-revoked) bootstrap key rather than the CI key. The original CI secret
// is unrecoverable — recovery path is Rotate CI.
const applyLockPath = resolve(infraDir, `.apply-in-progress.${stackShort}.lock`)
const interrupted = detectInterruptedApply({ yamlText: stackYaml, lockExists: existsSync(applyLockPath), lockPath: applyLockPath })
if (interrupted) {
  console.warn(
    `${warningMark} ${pc.bold('Previous Apply infra change run was interrupted.')}\n` +
      `  Stack credentials in Pulumi.${stackShort}.yaml may be a (now-revoked) bootstrap key instead of the CI key.\n` +
      `  Recover by re-running bootstrap and choosing ${pc.italic('"Rotate CI"')} to mint a fresh CI key.\n` +
      `  Trace: ${interrupted.trace}\n`,
  )
}

const mode: Mode =
  state === 'fresh'
    ? 'resume'
    : await select<Mode>({
        message: 'Existing config detected. How would you like to proceed?',
        default: 'resume',
        choices: [
          { name: 'Resume',            value: 'resume', description: 'Idempotent re-run; refreshes config & GitHub secrets. Cannot apply changes to DB/VPC/PN (CI key is read-only there).' },
          { name: 'Rotate CI',         value: 'rotate', description: 'Mint a fresh CI deploy key (existing one is deleted). Use after editing PROJECT_PERMISSION_SETS.' },
          { name: 'Apply infra change', value: 'apply', description: 'One-shot `pulumi up` with a bootstrap key for DB/VPC/PN changes; CI key is swapped out then restored.' },
          { name: 'Manage runtime secrets', value: 'secrets', description: 'List, set, rotate, or delete operator-managed runtime secrets in Scaleway Secret Manager.' },
          { name: 'Clean slate',       value: 'clean',  description: 'Print reset recipe and exit.' },
        ],
      })

if (mode === 'clean') {
  console.info(`\nSee infra/README.md (section "Clean slate") — start by: rm ${stackPath.replace(`${infraDir}/`, 'infra/')}`)
  process.exit(0)
}

if (mode === 'apply') {
  await runApplyMode()
  process.exit(0)
}

if (mode === 'secrets') {
  await runSecretsMode()
  process.exit(0)
}

// CI key step runs when: explicitly rotating, OR resuming and key not yet stored.
const needsCiKey = mode === 'rotate' || !hasCiKey

// Prompts (env vars override). Passphrase first — lets us decrypt stored CI key locally.
const envOr = async (envName: string, prompt: () => Promise<string>) => process.env[envName] || (await prompt())
const pulumiPassphrase = await envOr('PULUMI_CONFIG_PASSPHRASE', () => password({ message: 'Pulumi passphrase' }))

// On resume with stored CI key, derive SCW creds from the local stack file.
let scwAccessKey = ''
let scwSecretKey = ''
let scwProjectId = ''
if (stackYaml) {
  // projectId is plaintext config, available even before CI key is minted.
  scwProjectId = extractProjectId(stackYaml) ?? ''
}
if (hasCiKey && mode === 'resume') {
  try {
    const decrypted = decryptStackSecrets(stackPath, pulumiPassphrase, ['scaleway:accessKey', 'scaleway:secretKey'])
    scwAccessKey = decrypted['scaleway:accessKey'] ?? ''
    scwSecretKey = decrypted['scaleway:secretKey'] ?? ''
    if (scwAccessKey && scwSecretKey && scwProjectId)
      console.info(`${checkMark} Decrypted Scaleway creds from ${stackShort} stack (access key ${scwAccessKey})`)
  } catch (err) {
    console.error(`${warningMark} Could not decrypt stored creds: ${(err as Error).message}. Falling back to manual entry.`)
  }
}

if (!scwAccessKey || !scwSecretKey || !scwProjectId) {
  // These prompts collect the BOOTSTRAP key (broad perms, IAMManager) used to
  // mint or rotate the CI deploy key. Don't conflate with `SCW_ACCESS_KEY` /
  // `SCW_SECRET_KEY` — those names refer to the CI key written to GitHub.
  const needsBootstrapKey = mode === 'rotate' || state === 'fresh' || !hasCiKey
  const role = needsBootstrapKey ? 'bootstrap (needs IAMManager)' : ''
  scwAccessKey ||= await envOr('SCW_BOOTSTRAP_ACCESS_KEY', () =>
    input({ message: `Scaleway ${role} access key`.trim(), validate: (v) => !!v.trim() || '(required)' }),
  )
  scwSecretKey ||= await envOr('SCW_BOOTSTRAP_SECRET_KEY', () =>
    password({ message: `Scaleway ${role} secret key`.trim() }),
  )
  scwProjectId ||= await envOr('SCW_DEFAULT_PROJECT_ID', () =>
    input({ message: 'Scaleway project ID', validate: (v) => !!v.trim() || '(required)' }),
  )
}

// Pulumi's S3 backend still needs a bootstrap key on Resume. The provider can
// keep using the decrypted stack creds, but bucket preflight / login must use
// broader object-storage credentials.
const needsStateBootstrapKey = hasCiKey && mode === 'resume'
const stateAccessKey = needsStateBootstrapKey
  ? await envOr('SCW_BOOTSTRAP_ACCESS_KEY', () =>
      input({ message: 'Scaleway bootstrap access key (for Pulumi state bucket)', validate: (v) => !!v.trim() || '(required)' }),
    )
  : scwAccessKey
const stateSecretKey = needsStateBootstrapKey
  ? await envOr('SCW_BOOTSTRAP_SECRET_KEY', () =>
      password({ message: 'Scaleway bootstrap secret key (for Pulumi state bucket)' }),
    )
  : scwSecretKey

const stackName = await input({ message: 'Pulumi stack name', default: `organization/infra/${stackShort}` })

// Prompt for optional values only if they're not already in the stack yaml.
// Lets you fill in a value later (e.g. AI key) on a subsequent Resume run
// without re-prompting on every run once set.
const stackHas = (key: string) => !!stackYaml && new RegExp(`(^|\\n)\\s*${key.replace(':', ':\\s*')}\\s*:`).test(stackYaml)
const adminEmail = stackHas('infra:adminEmail') ? '' : await input({ message: 'Admin email (optional)' })
const brevoApiKey =
  !stackHas('infra:brevoApiKey') && adminEmail
    ? await password({ message: 'Brevo API key (optional)' }).catch(() => '')
    : ''
const scwAiApiKey = stackHas('infra:scwAiApiKey')
  ? ''
  : await password({ message: 'Scaleway AI API key (optional, for the AI worker)' }).catch(() => '')

const legacyRuntimeValues = stackYaml
  ? (() => {
      try {
        return decryptStackSecrets(stackPath, pulumiPassphrase, ['infra:adminEmail', 'infra:brevoApiKey', 'infra:scwAiApiKey'])
      } catch {
        return {}
      }
    })()
  : {}

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
  // Ignore any local `~/.config/scw/config.yaml` profile so the Scaleway
  // provider doesn't warn about "Multiple variable sources" when the user
  // has the Scaleway CLI configured. Point at a nonexistent file rather than
  // a bogus SCW_PROFILE name (the SDK validates profile names on provider
  // init, breaking `pulumi up`).
  SCW_CONFIG_PATH: scwConfigPathNone(infraDir),
  SCW_PROFILE: '',
}

const stateBucketEnv: NodeJS.ProcessEnv = {
  ...childEnv,
  SCW_ACCESS_KEY: stateAccessKey,
  SCW_SECRET_KEY: stateSecretKey,
}

async function step(label: string, cmd: string, args: string[], opts: { cwd?: string; retry?: boolean; env?: NodeJS.ProcessEnv } = {}): Promise<number> {
  while (true) {
    console.info(`\n→ ${label}\n  $ ${cmd} ${args.join(' ')}`)
    const { status } = spawnSync(cmd, args, { cwd: opts.cwd ?? infraDir, env: opts.env ?? childEnv, stdio: 'inherit' })
    if (status === 0) return 0
    console.error(`\n✗ ${label} failed (exit ${status}).`)
    if (!opts.retry || !(await confirm({ message: 'Retry?', default: true }))) return status ?? 1
  }
}

const must = async (...args: Parameters<typeof step>) => {
  const code = await step(...args)
  if (code !== 0) process.exit(code)
}

// Run chain.
await must('Ensure Pulumi state bucket', 'pnpm', ['ensure-state-bucket'], { retry: true, env: stateBucketEnv })

process.env.APP_MODE = process.env.APP_MODE ?? 'production'
const { appConfig } = await import('shared')
const loginUrl = `s3://${appConfig.slug}-pulumi-state?endpoint=s3.${appConfig.s3.region}.scw.cloud&region=${appConfig.s3.region}`

await must('Pulumi login (S3 backend)', 'pulumi', ['login', loginUrl], { retry: true })

// Select existing stack, or create it if missing.
const selected = spawnSync('pulumi', ['stack', 'select', stackName], { cwd: infraDir, env: childEnv, stdio: 'ignore' })
if (selected.status === 0) {
  console.info(`\n→ Pulumi stack: ${stackName} (exists — selected)`)
} else {
  await must('Pulumi stack init', 'pulumi', ['stack', 'init', stackName])
}

await must('Set scaleway:projectId', 'pulumi', ['config', 'set', 'scaleway:projectId', scwProjectId, '--stack', stackName])
await must('Initialize stack secrets', 'pnpm', ['init-stack-secrets', stackName])

const runtimeSecretPath = `/${appConfig.slug}-${stackShort}/`
await migrateRuntimeSecrets({
  secretKey: scwSecretKey,
  projectId: scwProjectId,
  region: appConfig.s3.region,
  path: runtimeSecretPath,
  valuesByLegacyKey: {
    'infra:adminEmail': legacyRuntimeValues['infra:adminEmail'] ?? (adminEmail || undefined),
    'infra:brevoApiKey': legacyRuntimeValues['infra:brevoApiKey'] ?? (brevoApiKey || undefined),
    'infra:scwAiApiKey': legacyRuntimeValues['infra:scwAiApiKey'] ?? (scwAiApiKey || undefined),
  },
})
if (!legacyRuntimeValues['infra:adminEmail'] && !adminEmail) {
  console.warn(`  ${warningMark} Required runtime secret admin-email is not set yet. Use "Manage runtime secrets" before deploying backend/ai.`)
}

// CI deploy key — run when explicitly rotating, or when none is stored yet.
let ciAccessKey = ''
let ciSecretKey = ''
let ciOrganizationId = ''
let ciApplicationId = ''
if (!needsCiKey) {
  console.info('\n→ CI deploy key — skipped (already in stack config)')
  const stored = stackYaml?.match(/(?:^|\n)\s*infra:ciPolicyFingerprint:\s*([^\s]+)/)?.[1]
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
      const k = await setupCiKey({ callerSecretKey: scwSecretKey, projectId: scwProjectId, slug: appConfig.slug })
      ciAccessKey = k.accessKey
      ciSecretKey = k.secretKey
      ciOrganizationId = k.organizationId
      ciApplicationId = k.applicationId
      break
    } catch (err) {
      // Missing IAMManager (org-scoped) on the bootstrap key is the usual cause.
      // Re-run with SCW_DEBUG=1 for request/response traces.
      console.error(`\n${warningMark} CI key setup failed: ${(err as Error).message}`)
      if (!(await confirm({ message: 'Retry?', default: true }))) break
    }
  }
}

if (ciAccessKey) {
  await must('Set infra:applicationId', 'pulumi', ['config', 'set', 'infra:applicationId', ciApplicationId, '--stack', stackName])
  await must('Set infra:ciPolicyFingerprint', 'pulumi', ['config', 'set', 'infra:ciPolicyFingerprint', policyFingerprint(), '--stack', stackName])
  // Record the operator's own principal (the bootstrap key identity). A local
  // `pulumi up` authenticates as this key, not the CI `applicationId`, so the
  // deploy-tags bucket policy must grant it or the seed PutObject 403s on a
  // fresh stack. Best-effort: only the first up on a fresh stack depends on it.
  try {
    const idRes = await fetch(`https://api.scaleway.com/iam/v1alpha1/api-keys/${scwAccessKey}`, {
      headers: { 'X-Auth-Token': scwSecretKey },
    })
    if (idRes.ok) {
      const identity = (await idRes.json()) as { user_id?: string; application_id?: string }
      const principal = identity.user_id
        ? `user_id:${identity.user_id}`
        : identity.application_id
          ? `application_id:${identity.application_id}`
          : ''
      if (principal)
        await must('Set infra:operatorPrincipal', 'pulumi', ['config', 'set', 'infra:operatorPrincipal', principal, '--stack', stackName])
    }
  } catch {
    console.warn(`  ${warningMark} Could not resolve operator principal; deploy-tags seed may 403 on a fresh stack.`)
  }
  // On Rotate (state !== 'fresh'), persist the new CI key now — VPC/PN/RDB
  // already exist, ReadOnly is enough for `pulumi up` to refresh them.
  // On Fresh, defer writing scaleway:accessKey/secretKey until *after* the
  // initial pulumi up so Pulumi falls back to SCW_ACCESS_KEY/SECRET env vars
  // in childEnv (= bootstrap key), which can actually create the bootstrap-
  // owned resources.
  if (state !== 'fresh') {
    await must('Set scaleway:accessKey', 'pulumi', ['config', 'set', '--secret', 'scaleway:accessKey', ciAccessKey, '--stack', stackName])
    await must('Set scaleway:secretKey', 'pulumi', ['config', 'set', '--secret', 'scaleway:secretKey', ciSecretKey, '--stack', stackName])
  }
}

// GitHub sync — writes CI deploy creds when we just (re)created a key.
// URLs (BACKEND_URL/FRONTEND_URL/YJS_URL/AI_URL) are no longer synced as
// Actions Variables: the deploy workflow derives them on every run from
// shared/ appConfig via infra/tasks/print-deploy-env.ts.
// Scoped to the GitHub Environment matching the stack so deploy creds are
// only injected into jobs that opt in via `environment:`.
await syncGithubEnvironment({
  repoRoot: resolve(infraDir, '..'),
  stackShort,
  ciKey: ciAccessKey ? { accessKey: ciAccessKey, secretKey: ciSecretKey, projectId: scwProjectId, organizationId: ciOrganizationId } : undefined,
  // EDGE_PIPELINE_ID is intentionally omitted — the deploy workflow writes
  // it after the first successful pulumi up.
})

const DIVIDER = pc.dim('─'.repeat(60))
console.info(`\n${DIVIDER}`)
if (!needsCiKey) {
  console.info(`${checkMark} ${pc.bold('Resume verified.')} CI key in stack config unchanged.`)
} else if (ciAccessKey) {
  console.info(`${checkMark} ${pc.bold(pc.greenBright('Bootstrap complete.'))} CI deploy key: ${pc.cyanBright(ciAccessKey)}`)
} else {
  console.info(`${warningMark} ${pc.bold(pc.yellowBright('Done, but CI key was not created.'))} Re-run and choose ${pc.italic('"Rotate CI"')}.`)
}
console.info(DIVIDER)

// Offer to run `pulumi up` from inside bootstrap. Running it from a plain
// shell requires AWS_*/PULUMI_CONFIG_PASSPHRASE for the S3 state backend,
// which bootstrap already has in `childEnv` — so the friction-free path is
// to invoke it here. Compute is intentionally skipped on a fresh stack
// (registry has no images yet) — we set the `bootstrap:applyInProgress`
// marker so helpers.ts gates compute off; CI deploys VMs after pushing
// images. If this run crashes before clearing the marker, compute stays
// off (safe) until a follow-up bootstrap resume clears it.
const canDeploy = hasCiKey || !!ciAccessKey
if (canDeploy) {
  console.info(`\n${pc.bold('Next: provision base infrastructure')} (registry, DB, network — no compute yet)`)
  const runNow = await confirm({ message: 'Run pulumi up now?', default: true })
  if (runNow) {
    // Edge Services pipelines require an active plan subscription. The plan
    // is not a Pulumi resource, so subscribe via the API once before deploy.
    // Idempotent — skips if already subscribed.
    try {
      await ensureEdgePlan({ secretKey: scwSecretKey, projectId: scwProjectId })
    } catch (err) {
      console.error(`\n${warningMark} Edge Services plan check failed: ${(err as Error).message}`)
      if (!(await confirm({ message: 'Continue with pulumi up anyway?', default: false }))) process.exit(1)
    }
    // DNS records (CAA, apex A, subdomain CNAMEs) need the zone hosted on
    // Scaleway DNS. Registers the external domain and waits for NS delegation.
    const { deriveInfra } = await import('../naming.js')
    const { domains: dnsDomains, hasDomain } = deriveInfra(appConfig)
    if (hasDomain) {
      try {
        await ensureDnsZone({ secretKey: scwSecretKey, projectId: scwProjectId, domain: dnsDomains.zone })
      } catch (err) {
        console.error(`\n${warningMark} DNS zone check failed: ${(err as Error).message}`)
        if (!(await confirm({ message: 'Continue with pulumi up anyway?', default: false }))) process.exit(1)
      }
    }
    // Invoke pulumi up with creds from env (SCW_ACCESS_KEY/SECRET in
    // childEnv = bootstrap key when freshly prompted, CI key when decrypted
    // from stack on Resume). We do NOT pass --config overrides because
    // `--config` persists to the stack file (footgun for credentials).
    // --non-interactive so the table renders one row per event instead of
    // redrawing (cleaner in scrollback).
    const usingBootstrapKey = state === 'fresh'
    if (usingBootstrapKey)
      console.info(`${pc.dim('  using bootstrap key for first provisioning (CI key has read-only on VPC/PN/RDB — cannot create them)')}`)
    // When stack config has scaleway:accessKey/secretKey (Resume / Rotate),
    // strip the matching env vars so the Scaleway provider sees one source
    // (the provider{} block) instead of warning about Multiple variable
    // sources. Fresh has no stack creds yet, so env vars are required.
    const pulumiUpEnv: NodeJS.ProcessEnv = usingBootstrapKey ? childEnv : stripScwProviderEnv(childEnv)
    // Fresh stacks: gate compute off via the bootstrap marker. Resume re-runs
    // an already-bootstrapped stack and must NOT toggle the gate.
    if (usingBootstrapKey) {
      const startedAt = new Date().toISOString()
      spawnSync('pulumi', ['config', 'set', 'bootstrap:applyInProgress', startedAt, '--stack', stackName], { cwd: infraDir, env: pulumiUpEnv, stdio: 'inherit' })
    }
    let upOk = false
    while (true) {
      const code = await runPulumiUpWithHint(stackName, infraDir, pulumiUpEnv)
      if (code === 0) { upOk = true; break }
      if (!(await confirm({ message: 'Retry?', default: true }))) process.exit(code)
    }
    if (usingBootstrapKey && upOk) {
      spawnSync('pulumi', ['config', 'rm', 'bootstrap:applyInProgress', '--stack', stackName], { cwd: infraDir, env: pulumiUpEnv, stdio: 'ignore' })
    }
    console.info(`\n${checkMark} Base infrastructure provisioned. Compute VMs will be deployed by CI after images are pushed.`)
    // On Fresh, persist the CI key now that bootstrap-owned resources exist.
    if (usingBootstrapKey && ciAccessKey) {
      await must('Set scaleway:accessKey', 'pulumi', ['config', 'set', '--secret', 'scaleway:accessKey', ciAccessKey, '--stack', stackName])
      await must('Set scaleway:secretKey', 'pulumi', ['config', 'set', '--secret', 'scaleway:secretKey', ciSecretKey, '--stack', stackName])
    }
  } else {
    console.info(`  Re-run bootstrap any time to retry, or set the env vars manually:`)
    console.info(
      `  ${pc.cyan(`cd infra && SCW_ACCESS_KEY=<scw-access> SCW_SECRET_KEY=<scw-secret> AWS_ACCESS_KEY_ID=<scw-access> AWS_SECRET_ACCESS_KEY=<scw-secret> PULUMI_CONFIG_PASSPHRASE='<passphrase>' pulumi up --stack ${stackName}`)}`,
    )
    if (state === 'fresh' && ciAccessKey) {
      console.info(`  ${pc.dim('After pulumi up succeeds, persist the CI key into stack config (the secret is shown only once):')}`)
      for (const line of manualRestoreCommands(stackName, ciAccessKey, ciSecretKey)) console.info(`  ${pc.cyan(line)}`)
    }
  }
}
if (needsCiKey && ciAccessKey) {
  console.info(`\n${pc.dim('Reminder:')} revoke the bootstrap key now — see ${pc.underline('infra/README.md')} → ${pc.italic('"Revoke the bootstrap key"')}`)
}

/** One-shot `pulumi up` using a freshly-supplied bootstrap key, with the
 *  CI key swapped out of stack config and restored afterwards (try/finally).
 *  For applying changes to bootstrap-owned modules (DB / VPC / private network)
 *  without permanently widening CI permissions. */
async function runApplyMode(): Promise<void> {
  if (state !== 'bootstrapped') {
    console.error(`${warningMark} "Apply infra change" requires a fully bootstrapped stack (state=${state}). Run Resume first.`)
    process.exit(1)
  }
  console.info(pc.dim('\nApply infra change: swap CI key out for a bootstrap key, run pulumi up, restore CI key.\n'))

  const passphrase = process.env.PULUMI_CONFIG_PASSPHRASE || (await password({ message: 'Pulumi passphrase' }))

  let ciAccess = ''
  let ciSecret = ''
  try {
    const d = decryptStackSecrets(stackPath, passphrase, ['scaleway:accessKey', 'scaleway:secretKey'])
    ciAccess = d['scaleway:accessKey'] ?? ''
    ciSecret = d['scaleway:secretKey'] ?? ''
    if (!ciAccess || !ciSecret) throw new Error('scaleway:accessKey/secretKey not present in stack config')
    console.info(`${checkMark} CI key snapshotted (access: ${pc.dim(ciAccess)}) — will be restored after pulumi up`)
  } catch (err) {
    console.error(`${warningMark} Could not decrypt CI key: ${(err as Error).message}`)
    process.exit(1)
  }

  const projectId = (stackYaml && extractProjectId(stackYaml)) || ''
  if (!projectId) {
    console.error(`${warningMark} scaleway:projectId not found in stack config.`)
    process.exit(1)
  }

  const bootAccess =
    process.env.SCW_BOOTSTRAP_ACCESS_KEY ||
    (await input({ message: 'Bootstrap access key (IAMManager + write on the resource you are changing)', validate: (v) => !!v.trim() || '(required)' }))
  const bootSecret = process.env.SCW_BOOTSTRAP_SECRET_KEY || (await password({ message: 'Bootstrap secret key' }))

  const targetStack = await input({ message: 'Pulumi stack name', default: `organization/infra/${stackShort}` })

  if (!(await confirm({ message: `Swap stack creds to bootstrap key and run \`pulumi up\` on ${targetStack}?`, default: true }))) {
    console.info('Aborted; no changes made.')
    return
  }

  console.warn(
    `${pc.yellow(pc.bold('\u26A0  Do not interrupt this run.'))} ${pc.dim('Ctrl-C / SIGTERM are handled, but a hard crash (kill -9, power loss) would leave the bootstrap key in stack config.')}`,
  )

  const apEnv: NodeJS.ProcessEnv = {
    ...process.env,
    SCW_DEFAULT_PROJECT_ID: projectId,
    SCW_PROJECT_ID: projectId,
    // S3 backend (Pulumi state bucket) still needs the bootstrap key.
    AWS_ACCESS_KEY_ID: bootAccess,
    AWS_SECRET_ACCESS_KEY: bootSecret,
    PULUMI_CONFIG_PASSPHRASE: passphrase,
    // Same rationale as childEnv — ignore the user's Scaleway CLI profile.
    SCW_CONFIG_PATH: scwConfigPathNone(infraDir),
    SCW_PROFILE: '',
  }

  process.env.APP_MODE = process.env.APP_MODE ?? 'production'
  const { appConfig: ac } = await import('shared')
  const loginUrl = `s3://${ac.slug}-pulumi-state?endpoint=s3.${ac.s3.region}.scw.cloud&region=${ac.s3.region}`
  spawnSync('pulumi', ['login', loginUrl], { cwd: infraDir, env: apEnv, stdio: 'inherit' })
  spawnSync('pulumi', ['stack', 'select', targetStack], { cwd: infraDir, env: apEnv, stdio: 'ignore' })

  let swapped = false
  // Synchronous restore used by both the normal finally path AND signal /
  // exception handlers. spawnSync survives because handler-spawned children
  // form a new process: SIGINT to the parent doesn't propagate to them.
  // Also clears the YAML marker; ignore its exit status (cosmetic cleanup).
  const restoreSync = (): boolean => {
    const r1 = spawnSync('pulumi', ['config', 'set', '--secret', 'scaleway:accessKey', ciAccess, '--stack', targetStack], { cwd: infraDir, env: apEnv, stdio: 'inherit' })
    const r2 = spawnSync('pulumi', ['config', 'set', '--secret', 'scaleway:secretKey', ciSecret, '--stack', targetStack], { cwd: infraDir, env: apEnv, stdio: 'inherit' })
    spawnSync('pulumi', ['config', 'rm', 'bootstrap:applyInProgress', '--stack', targetStack], { cwd: infraDir, env: apEnv, stdio: 'ignore' })
    return r1.status === 0 && r2.status === 0
  }
  const onFatal = (label: string) => {
    if (!swapped) process.exit(130)
    console.warn(`\n${warningMark} ${pc.bold(label)} — restoring CI key in stack config…`)
    const ok = restoreSync()
    if (ok) {
      try { unlinkSync(applyLockPath) } catch {}
      console.warn(`${checkMark} CI key restored.`)
      process.exit(130)
    }
    console.error(`${warningMark} ${pc.bold('FAILED to restore CI key!')} Run manually:`)
    for (const line of manualRestoreCommands(targetStack, ciAccess, ciSecret)) console.error(`  ${pc.cyan(line)}`)
    process.exit(1)
  }
  const onSigint = () => onFatal('Interrupted (SIGINT)')
  const onSigterm = () => onFatal('Terminated (SIGTERM)')
  const onException = (err: unknown) => {
    console.error(err)
    onFatal('Uncaught exception')
  }
  process.on('SIGINT', onSigint)
  process.on('SIGTERM', onSigterm)
  process.on('uncaughtException', onException)
  process.on('unhandledRejection', onException)
  try {
    const startedAt = new Date().toISOString()
    writeFileSync(applyLockPath, `${startedAt}\nci-access:${ciAccess}\n`)
    const m = spawnSync('pulumi', ['config', 'set', 'bootstrap:applyInProgress', startedAt, '--stack', targetStack], { cwd: infraDir, env: apEnv, stdio: 'inherit' })
    const a1 = spawnSync('pulumi', ['config', 'set', '--secret', 'scaleway:accessKey', bootAccess, '--stack', targetStack], { cwd: infraDir, env: apEnv, stdio: 'inherit' })
    const a2 = spawnSync('pulumi', ['config', 'set', '--secret', 'scaleway:secretKey', bootSecret, '--stack', targetStack], { cwd: infraDir, env: apEnv, stdio: 'inherit' })
    if (m.status !== 0 || a1.status !== 0 || a2.status !== 0) throw new Error('Failed to swap stack credentials')
    swapped = true
    while (true) {
      const code = await runPulumiUpWithHint(targetStack, infraDir, apEnv)
      if (code === 0) break
      if (!(await confirm({ message: 'Retry pulumi up?', default: false }))) break
    }
  } finally {
    if (swapped) {
      console.info('\n→ Restoring CI key in stack config')
      const ok = restoreSync()
      if (!ok) {
        console.error(`${warningMark} ${pc.bold('FAILED to restore CI key in stack config!')} Run manually:`)
        for (const line of manualRestoreCommands(targetStack, ciAccess, ciSecret)) console.error(`  ${pc.cyan(line)}`)
        process.exit(1)
      }
      console.info(`${checkMark} CI key restored.`)
    }
    try { unlinkSync(applyLockPath) } catch {}
    process.off('SIGINT', onSigint)
    process.off('SIGTERM', onSigterm)
    process.off('uncaughtException', onException)
    process.off('unhandledRejection', onException)
  }

  console.info(`\n${pc.dim('Reminder:')} revoke the bootstrap key now (Scaleway console → IAM → API keys).`)
}

async function runSecretsMode(): Promise<void> {
  const projectId =
    process.env.SCW_PROJECT_ID ||
    process.env.SCW_DEFAULT_PROJECT_ID ||
    extractProjectId(stackYaml ?? '') ||
    (await input({ message: 'Scaleway project ID', validate: (v) => !!v.trim() || '(required)' }))
  const secretKey =
    process.env.SCW_SECRET_KEY ||
    process.env.SCW_BOOTSTRAP_SECRET_KEY ||
    (await password({ message: 'Scaleway secret key with Secret Manager access' }))

  process.env.APP_MODE = process.env.APP_MODE ?? stackShort
  const { appConfig } = await import('shared')
  const path = `/${appConfig.slug}-${stackShort}/`

  await manageRuntimeSecrets({
    secretKey,
    projectId,
    region: appConfig.s3.region,
    path,
    prompts: { select, password, confirm },
  })
}

