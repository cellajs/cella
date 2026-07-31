import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { promises as dns } from 'node:dns'
import { existsSync, readFileSync } from 'node:fs'
import type { EngineConfig } from '../config/engine-config'
import { healthContract } from '../config/health.config'
import { isMain } from '../lib/utils/is-main'
import { infraDir } from '../lib/utils/paths'
import { deriveInfra } from '../lib/naming'
import { serviceEndpoints } from '../lib/services'
import { resolveProjectId } from '../lib/scaleway/bootstrap-scw-env'
import { parseGithubOriginRepo } from '../lib/github-sync'
import { controlKey, lockKey, makeControlClient, peekLock, readControlState, stateBucket } from '../lib/stack/control-store'
import { createSecretManagerClient } from '../lib/scaleway/scaleway-secret-manager'
import { secretManagerPath } from '../lib/scaleway/vm-reader-secret'
import { operatorManagedRuntimeSecrets } from '../lib/runtime-secrets'
import { createFetchProbe } from './wait-for-version'
import { detectComputeDeferred, detectStackState, pickStackShort, type StackState } from '../lib/stack/bootstrap-stack-state'
import { evaluateStatus } from '../lib/status/evaluate'
import type { CheckStatus, GithubInputs, LiveServiceInput, RolloutServiceInput, StatusInputs, StatusReport } from '../lib/status/types'
import { getFlag } from './args'
import { checkMark, crossMark, DIVIDER, pc, warningMark, withSpinner } from '../lib/utils/cli-output'

/** GitHub Environment secrets a deploy needs; mirrors github-sync's write set. */
const REQUIRED_ENV_SECRETS = ['SCW_ACCESS_KEY', 'SCW_SECRET_KEY', 'SCW_PROJECT_ID', 'SCW_ORGANIZATION_ID', 'PULUMI_CONFIG_PASSPHRASE']

/** Everything the report needs about the target stack, from the menu or standalone. */
export interface StatusContext {
  mode: string
  appConfig: EngineConfig
  stackState: StackState
  stackYaml?: string
  projectId?: string
}

/** True when `cmd args` exits 0 (a presence probe). */
function hasTool(cmd: string, args: string[]): boolean {
  return spawnSync(cmd, args, { stdio: 'ignore' }).status === 0
}

/** An S3-style NoSuchBucket, distinct from a missing control object (bucket exists). */
function isNoSuchBucket(err: unknown): boolean {
  const e = err as { name?: string }
  return e?.name === 'NoSuchBucket'
}

async function gatherGithub(ghAuthed: boolean, mode: string): Promise<GithubInputs> {
  if (!ghAuthed) return { authenticated: false }
  const origin = spawnSync('git', ['remote', 'get-url', 'origin'], { cwd: infraDir, encoding: 'utf8' }).stdout?.trim() ?? ''
  const repo = parseGithubOriginRepo(origin)
  if (!repo) return { authenticated: true }
  const envRes = spawnSync('gh', ['api', `repos/${repo}/environments/${mode}`], { encoding: 'utf8', stdio: ['ignore', 'ignore', 'ignore'] })
  const environmentExists = envRes.status === 0
  let missingSecrets: string[] | undefined
  if (environmentExists) {
    const secRes = spawnSync('gh', ['api', `repos/${repo}/environments/${mode}/secrets`, '--jq', '.secrets[].name'], { encoding: 'utf8' })
    if (secRes.status === 0) {
      const present = new Set((secRes.stdout ?? '').split('\n').map((s) => s.trim()).filter(Boolean))
      missingSecrets = REQUIRED_ENV_SECRETS.filter((name) => !present.has(name))
    }
  }
  return { authenticated: true, repo, environmentExists, missingSecrets }
}

interface ScalewayFacts {
  stateBucketExists?: boolean
  lock?: StatusInputs['lock']
  rollout?: RolloutServiceInput[]
  requiredSecretsMissing?: string[]
}

async function gatherScaleway(opts: { region: string; slug: string; projectId?: string; accessKey: string; secretKey: string; mode: string }): Promise<ScalewayFacts> {
  const out: ScalewayFacts = {}
  const s3 = await makeControlClient(opts.region, opts.accessKey, opts.secretKey)
  const bucket = stateBucket(opts.slug)

  try {
    const { state } = await readControlState(s3, bucket, controlKey(opts.mode))
    out.stateBucketExists = true
    out.rollout = Object.entries(state.rollout).map(([slug, r]) => ({ slug, activeSha: r.active?.sha, pendingSha: r.pendingSha }))
  } catch (err) {
    if (isNoSuchBucket(err)) out.stateBucketExists = false
  }

  if (out.stateBucketExists) {
    try {
      const info = await peekLock(s3, bucket, lockKey(opts.mode))
      out.lock = info
        ? { held: true, owner: info.owner, operation: info.operation, acquiredAt: info.acquiredAt, expiresAt: info.expiresAt, stale: Date.parse(info.expiresAt) < Date.now() }
        : { held: false }
    } catch {
      // Leave lock undefined (reported as unknown).
    }
  }

  if (opts.projectId) {
    try {
      const client = createSecretManagerClient({ secretKey: opts.secretKey, region: opts.region, projectId: opts.projectId })
      const existing = await client.listSecretsUnder(secretManagerPath(opts.slug, opts.mode))
      const versioned = new Set(existing.filter((s) => (s.version_count ?? 0) > 0).map((s) => s.name))
      out.requiredSecretsMissing = operatorManagedRuntimeSecrets.filter((s) => s.required && !versioned.has(s.secretName)).map((s) => s.secretName)
    } catch {
      // Leave requiredSecretsMissing undefined (reported as unknown).
    }
  }
  return out
}

async function gatherLive(appConfig: EngineConfig): Promise<LiveServiceInput[] | undefined> {
  let endpoints: ReturnType<typeof serviceEndpoints>
  try {
    endpoints = serviceEndpoints(appConfig)
  } catch {
    return undefined
  }
  // Status is a snapshot, not a rollout gate, so a shorter timeout than the
  // deploy poller keeps the worst-case wait small when a service is down.
  const probe = createFetchProbe(3000)
  return Promise.all(
    endpoints.map(async (endpoint): Promise<LiveServiceInput> => {
      const healthUrl = `${endpoint.url.replace(/\/$/, '')}${healthContract.path}`
      const result = await probe(healthUrl)
      return { slug: endpoint.slug, healthUrl, probe: { status: result.status, version: result.version } }
    }),
  )
}

async function gatherDns(appConfig: EngineConfig): Promise<StatusInputs['dns']> {
  let host: string | undefined
  try {
    const endpoints = serviceEndpoints(appConfig)
    host = (endpoints.find((e) => e.slug === 'frontend') ?? endpoints[0])?.host
  } catch {
    return undefined
  }
  if (!host) return undefined
  try {
    const ips = await dns.resolve4(host)
    return { host, resolvedIps: ips }
  } catch (err) {
    const code = (err as { code?: string }).code
    if (code === 'ENOTFOUND' || code === 'NODATA') return { host, resolvedIps: [] }
    return { host }
  }
}

/** Best-effort I/O gather. Any probe that cannot run leaves its field undefined. */
export async function gatherInputs(ctx: StatusContext): Promise<StatusInputs> {
  const tooling = {
    pulumi: hasTool('pulumi', ['version']),
    dockerBuildx: hasTool('docker', ['buildx', 'version']),
    gh: hasTool('gh', ['auth', 'status']),
  }
  let hasDomain = false
  try {
    hasDomain = deriveInfra(ctx.appConfig).hasDomain
  } catch {
    hasDomain = Boolean(ctx.appConfig.domain && ctx.appConfig.domain !== 'localhost')
  }
  const accessKey = process.env.SCW_ACCESS_KEY ?? process.env.AWS_ACCESS_KEY_ID
  const secretKey = process.env.SCW_SECRET_KEY ?? process.env.AWS_SECRET_ACCESS_KEY
  const credentialsAvailable = Boolean(accessKey && secretKey)
  const projectId = ctx.projectId ?? resolveProjectId()

  const [github, scaleway, liveRaw, dnsInputs] = await Promise.all([
    gatherGithub(tooling.gh, ctx.mode).catch(() => ({ authenticated: tooling.gh }) as GithubInputs),
    credentialsAvailable && accessKey && secretKey
      ? gatherScaleway({ region: ctx.appConfig.s3.region, slug: ctx.appConfig.slug, projectId, accessKey, secretKey, mode: ctx.mode }).catch(() => ({}) as ScalewayFacts)
      : Promise.resolve({} as ScalewayFacts),
    gatherLive(ctx.appConfig).catch(() => undefined),
    hasDomain ? gatherDns(ctx.appConfig).catch(() => undefined) : Promise.resolve(undefined),
  ])

  const live = liveRaw?.map((l) => ({ ...l, expectedSha: scaleway.rollout?.find((r) => r.slug === l.slug)?.activeSha }))

  return {
    mode: ctx.mode,
    stackState: ctx.stackState,
    computeDeferredSince: detectComputeDeferred(ctx.stackYaml),
    tooling,
    hasDomain,
    credentialsAvailable,
    projectId,
    adminAppId: process.env.SCW_ADMIN_APPLICATION_ID?.trim() || process.env.SCW_OPERATOR_APPLICATION_ID?.trim() || undefined,
    github,
    stateBucketExists: scaleway.stateBucketExists,
    lock: scaleway.lock,
    rollout: scaleway.rollout,
    requiredSecretsMissing: scaleway.requiredSecretsMissing,
    live,
    dns: dnsInputs,
  }
}

/** Build the full report (evaluator + wall-clock stamp). */
export async function buildReport(ctx: StatusContext): Promise<StatusReport> {
  const evaluated = evaluateStatus(await gatherInputs(ctx))
  return { ...evaluated, generatedAt: new Date().toISOString() }
}

const MARKS: Record<CheckStatus, string> = {
  ok: checkMark,
  warn: warningMark,
  missing: crossMark,
  error: crossMark,
  unknown: pc.dim('?'),
}

/** Render the report for a terminal. */
export function formatReport(report: StatusReport): string {
  const lines: string[] = []
  const s = report.summary
  lines.push(pc.dim(DIVIDER))
  lines.push(`${pc.bold('infra status')}  ${pc.cyan(report.mode)}  ${pc.dim(`(${report.stackState})`)}`)
  lines.push(
    pc.dim(
      `${s.ok} ok · ${s.warn} warn · ${s.missing} missing · ${s.error} error · ${s.unknown} unknown`,
    ),
  )
  lines.push(pc.dim(DIVIDER))
  // Pad the raw title to the widest, then colour, so values align in a column.
  const width = report.checks.reduce((max, check) => Math.max(max, check.title.length), 0)
  for (const check of report.checks) {
    const label = pc.bold(pc.gray(check.title.padEnd(width)))
    lines.push(`${MARKS[check.status]} ${label}  ${check.detail}`)
  }
  if (report.nextAction) {
    lines.push(pc.dim(DIVIDER))
    lines.push(`${pc.bold('Next:')} ${report.nextAction.description}`)
    lines.push(`  ${pc.cyan(report.nextAction.command)}`)
  }
  return lines.join('\n')
}

/** Print the report as JSON or human text. */
export function printReport(report: StatusReport, opts: { json?: boolean }): void {
  console.info(opts.json ? JSON.stringify(report, null, 2) : formatReport(report))
}

/**
 * Menu entry: report status for an already-loaded CLI context. Human output;
 * the standalone `pnpm --filter infra status --json` path serves machines.
 */
export async function runStatus(context: { environment: string; appConfig: EngineConfig; state: StackState; stackYaml?: string; projectId: string }): Promise<void> {
  const report = await withSpinner('Checking infra status', () =>
    buildReport({
      mode: context.environment,
      appConfig: context.appConfig,
      stackState: context.state,
      stackYaml: context.stackYaml,
      projectId: context.projectId || undefined,
    }),
  )
  printReport(report, { json: false })
}

/** Load backend/.env, root .env, then the mode-scoped override (matching the CLI). */
function loadEnvForMode(mode: string): void {
  for (const envFile of [resolve(infraDir, '..', 'backend', '.env'), resolve(infraDir, '..', '.env')]) {
    if (existsSync(envFile)) process.loadEnvFile(envFile)
  }
  const modeEnvPath = resolve(infraDir, `.env.${mode}`)
  if (existsSync(modeEnvPath)) {
    for (const line of readFileSync(modeEnvPath, 'utf8').split('\n')) {
      const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
      if (match) process.env[match[1]!] = (match[2] ?? '').replace(/^['"]|['"]$/g, '')
    }
  }
}

/** Standalone entry: `pnpm --filter infra status [--mode <m>] [--json]`. */
export async function main(argv = process.argv.slice(2)): Promise<void> {
  const flagMode = getFlag(argv, '--mode') ?? process.env.INFRA_MODE
  if (flagMode && flagMode !== 'production' && flagMode !== 'staging') throw new Error(`--mode must be 'production' or 'staging' (got '${flagMode}')`)
  const mode = (flagMode as 'production' | 'staging' | undefined) ?? pickStackShort((name) => existsSync(resolve(infraDir, `Pulumi.${name}.yaml`)))
  const json = argv.includes('--json')

  loadEnvForMode(mode)
  process.env.APP_MODE = mode
  const { loadEngineConfig } = await import('../config/engine-config')
  const appConfig = await loadEngineConfig()

  const stackPath = resolve(infraDir, `Pulumi.${mode}.yaml`)
  const stackYaml = existsSync(stackPath) ? readFileSync(stackPath, 'utf8') : undefined
  const stackState = detectStackState({ yamlText: stackYaml })

  const report = await withSpinner('Checking infra status', () => buildReport({ mode, appConfig, stackState, stackYaml, projectId: resolveProjectId() }))
  printReport(report, { json })
}

if (isMain(import.meta.url)) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  })
}
