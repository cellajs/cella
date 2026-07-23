import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { errorMessage } from '../lib/utils/errors'
import { isMain } from '../lib/utils/is-main'
import { infraDir } from '../lib/utils/paths'
import { getFlag } from './args'
import { main as runWavedRolloutCli } from './deploy-rollout'
import { type AllowedKey, buildDeployEnv, isAllowedProductionRef } from './print-deploy-env'
import { createFetchProbe, pollForVersion } from './wait-for-version'

/**
 * The whole deploy after image builds, as ONE command: preflights, stack lock,
 * base stack update, waved rollout, public version verification, atomic
 * frontend entry publish, smoke checks, boot diagnostics on failure. CI
 * (.github/workflows/deploy.yml) is a thin trigger around this; any CI system
 * (or an operator shell) that provides the SCW_* credentials can run it.
 */
export interface DeployOptions {
  mode: string
  sha: string
  /** Frontend dist directory (entry publish + smoke); both are skipped when absent. */
  distDir?: string
  /** CI ref for the production trust gate; local operator runs may omit it. */
  gitRef?: string
}

/** One executed step: subprocess steps run through `exec`, the rest in-process. */
export interface DeployEffects {
  /** Run a CLI in the infra dir; throws on non-zero exit unless allowFailure. */
  exec(cmd: string, args: string[], opts?: { allowFailure?: boolean; stdin?: string }): void
  rollout(argv: string[]): Promise<void>
  verifyVersion(url: string, sha: string): Promise<boolean>
  publishEntryFiles(opts: { distDir: string; bucket: string; region: string }): Promise<void>
  bootDiagnostics(): Promise<void>
  group(title: string): void
  groupEnd(): void
  info(msg: string): void
}

interface RolloutRow {
  service: string
  health_url: string
}

export function parseDeployArgs(argv: string[]): DeployOptions {
  const mode = getFlag(argv, '--mode')
  const sha = getFlag(argv, '--sha')
  if (!mode || !sha) throw new Error('Usage: deploy.ts --mode <staging|production> --sha <git-sha> [--dist <dir>] [--git-ref <ref>]')
  if (sha === 'latest' || sha.endsWith(':latest')) throw new Error(`Refusing to deploy non-pinned image tag '${sha}'`)
  return { mode, sha, distDir: getFlag(argv, '--dist'), gitRef: getFlag(argv, '--git-ref') }
}

/** Task step runner: `tsx tasks/<file>.ts <args>` in the infra dir. */
const task = (file: string, ...args: string[]): [string, string[]] => ['pnpm', ['exec', 'tsx', `tasks/${file}.ts`, ...args]]

/** Derive the deploy env table from the app config for the requested mode. */
async function loadDeployEnvFromConfig(opts: DeployOptions): Promise<Record<AllowedKey, string>> {
  process.env.APP_MODE = opts.mode
  const { appConfig } = await import('shared')
  if (appConfig.mode !== opts.mode) throw new Error(`Mode mismatch: requested "${opts.mode}" but loaded config is "${appConfig.mode}"`)
  return buildDeployEnv(appConfig, { imageTag: opts.sha })
}

export async function runDeploy(
  opts: DeployOptions,
  fx: DeployEffects,
  loadDeployEnv: (opts: DeployOptions) => Promise<Record<AllowedKey, string>> = loadDeployEnvFromConfig,
): Promise<void> {
  if (opts.mode === 'production' && opts.gitRef && !isAllowedProductionRef(opts.gitRef)) {
    throw new Error(`Production deploys are only allowed from the main branch or a release tag (got ${opts.gitRef})`)
  }

  const env = await loadDeployEnv(opts)
  const stack = env.pulumi_stack

  // Downstream tools read AWS_*/region conventions; derive them once here.
  process.env.AWS_ACCESS_KEY_ID ??= process.env.SCW_ACCESS_KEY ?? ''
  process.env.AWS_SECRET_ACCESS_KEY ??= process.env.SCW_SECRET_KEY ?? ''
  process.env.SCW_DEFAULT_REGION ??= env.region

  const step = async (title: string, run: () => void | Promise<void>): Promise<void> => {
    fx.group(title)
    const startedAt = Date.now()
    try {
      await run()
      fx.info(`[deploy] ${title}: ok (${Math.round((Date.now() - startedAt) / 1000)}s)`)
    } finally {
      fx.groupEnd()
    }
  }

  let lockHeld = false
  try {
    await step('Ensure Pulumi state bucket', () => fx.exec(...task('ensure-state-bucket')))
    await step('Login to S3 state backend', () =>
      fx.exec('pulumi', ['login', `s3://${env.state_bucket}?endpoint=s3.${env.region}.scw.cloud&region=${env.region}`]))
    await step('Select stack', () => fx.exec('pulumi', ['stack', 'select', stack]))
    await step('Acquire stack lock', () => {
      fx.exec(...task('stack-lock', 'acquire', '--stack', stack, '--operation', 'deploy', '--ttl-min', '60'))
      lockHeld = true
    })
    await step('Pre-install Pulumi providers', () => fx.exec(...task('install-pulumi-providers')))
    await step('Wait for image tags in registry', () => {
      const registry = `rg.${env.region}.scw.cloud`
      fx.exec('docker', ['login', registry, '-u', 'nologin', '--password-stdin'], { stdin: process.env.SCW_SECRET_KEY ?? '' })
      fx.exec(...task('wait-for-images', '--registry', registry, '--ns', env.registry_ns, '--tag', opts.sha, '--build-images-json', env.build_images_matrix))
    })
    await step('Repair errored LB certificates', () => fx.exec(...task('repair-certs', '--stack', stack)))
    await step('Base stack update', () => {
      fx.exec(...task('sync-rollout-config', '--stack', stack))
      fx.exec('pulumi', ['up', '--stack', stack, '--yes', '--non-interactive', '--skip-preview'])
    })
    await step('Verify VM reader IAM grant', () =>
      fx.exec(...task('assert-vm-grants', '--application-name', env.vm_reader_app, '--project-id', process.env.SCW_DEFAULT_PROJECT_ID ?? '', '--organization-id', process.env.SCW_DEFAULT_ORGANIZATION_ID ?? '')))
    await step('Verify runtime secrets are deliverable', () =>
      fx.exec(...task('assert-secrets-deliverable', '--region', env.region, '--project-id', process.env.SCW_DEFAULT_PROJECT_ID ?? '', '--services-json', env.enabled_services_json)))

    try {
      await step('Waved rollout', () =>
        fx.rollout(['--stack', stack, '--sha', opts.sha, '--primary-json', env.primary_rollout_matrix, '--rest-json', env.roll_rest_matrix]))
    } catch (err) {
      fx.info('[deploy] rollout failed; collecting boot diagnostics')
      await fx.bootDiagnostics().catch((diagErr) => fx.info(`[deploy] boot diagnostics failed: ${errorMessage(diagErr)}`))
      throw err
    }

    await step('Verify public versions', async () => {
      const rows: RolloutRow[] = [...JSON.parse(env.primary_rollout_matrix), ...JSON.parse(env.roll_rest_matrix)]
      for (const row of rows) {
        if (!row.health_url) continue
        const ok = await fx.verifyVersion(`${row.health_url.replace(/\/$/, '')}/health`, opts.sha)
        if (!ok) throw new Error(`Service '${row.service}' does not serve ${opts.sha}`)
      }
    })

    if (opts.distDir) {
      // Strictly after rollout verification: users only load the new entry
      // files once every service already serves the new release.
      await step('Publish frontend entry files', () =>
        fx.publishEntryFiles({ distDir: opts.distDir ?? '', bucket: env.frontend_bucket, region: env.region }))
      await step('Smoke tests', () =>
        fx.exec(...task('smoke', '--sha', opts.sha, '--services-json', env.enabled_services_json, '--dist', resolve(opts.distDir ?? '', 'index.html'))))
    } else {
      fx.info('[deploy] no --dist provided; skipping frontend entry publish and smoke tests')
    }
  } finally {
    if (lockHeld) {
      const [cmd, args] = task('stack-lock', 'release', '--stack', stack)
      fx.exec(cmd, args, { allowFailure: true })
    }
  }
}

// Real effects: subprocesses in the infra dir, S3 entry publish, GitHub-aware
// log grouping. Kept thin; every ordering/failure decision lives in runDeploy.

const ENTRY_FILES: Array<{ name: string; contentType: string }> = [
  { name: 'index.html', contentType: 'text/html; charset=utf-8' },
  { name: 'sw.js', contentType: 'text/javascript; charset=utf-8' },
  { name: 'manifest.webmanifest', contentType: 'application/manifest+json' },
]

async function publishEntryFilesToBucket(opts: { distDir: string; bucket: string; region: string }): Promise<void> {
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3')
  const s3 = new S3Client({
    region: opts.region,
    endpoint: `https://s3.${opts.region}.scw.cloud`,
    credentials: {
      accessKeyId: process.env.SCW_ACCESS_KEY ?? process.env.AWS_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.SCW_SECRET_KEY ?? process.env.AWS_SECRET_ACCESS_KEY ?? '',
    },
    forcePathStyle: false,
  })
  for (const file of ENTRY_FILES) {
    const path = resolve(opts.distDir, file.name)
    if (!existsSync(path)) continue
    const body = await readFile(path)
    await s3.send(new PutObjectCommand({
      Bucket: opts.bucket,
      Key: file.name,
      Body: body,
      ContentType: file.contentType,
      CacheControl: 'no-cache, no-store, must-revalidate',
    }))
    console.info(`[deploy] published ${basename(path)} (${body.length} bytes)`)
  }
}

function createRealEffects(): DeployEffects {
  const inActions = Boolean(process.env.GITHUB_ACTIONS)
  return {
    exec(cmd, args, opts = {}) {
      const res = spawnSync(cmd, args, {
        cwd: infraDir,
        env: process.env,
        stdio: [opts.stdin === undefined ? 'inherit' : 'pipe', 'inherit', 'inherit'],
        input: opts.stdin,
      })
      if (res.status !== 0 && !opts.allowFailure) throw new Error(`${cmd} ${args[0] ?? ''} failed with exit ${res.status}`)
    },
    rollout: (argv) => runWavedRolloutCli(argv),
    async verifyVersion(url, sha) {
      const out = await pollForVersion({ url, expectedSha: sha, probe: createFetchProbe(8000), attempts: 40, intervalMs: 3000 })
      return out.ok
    },
    publishEntryFiles: publishEntryFilesToBucket,
    async bootDiagnostics() {
      const { main: diag } = await import('./diag')
      await diag([])
    },
    group: (title) => console.info(inActions ? `::group::${title}` : `\n=== ${title} ===`),
    groupEnd: () => {
      if (inActions) console.info('::endgroup::')
    },
    info: (msg) => console.info(msg),
  }
}

if (isMain(import.meta.url)) {
  runDeploy(parseDeployArgs(process.argv.slice(2)), createRealEffects()).catch((err) => {
    console.error(errorMessage(err))
    process.exit(1)
  })
}
