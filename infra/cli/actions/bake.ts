import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { warningMark } from 'shared/console'
import generalConfig from '../../config/general.config'
import type { Environment } from '../../lib/bootstrap-stack-state'
import { resolvePerMode } from '../../lib/general-config'
import { lookupImageByName } from '../../lib/image-lookup'
import { infraDir } from '../../lib/paths'

/** Resolved compute image name for an environment (e.g. `cella-docker-node-agent-v1`). */
export function computeImageName(environment: Environment): string {
  return resolvePerMode(generalConfig.compute.image, environment)
}

const IMAGE_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Does a baked compute image already exist for this environment? Mirrors the
 * deploy-time lookup (newest image with `compute.image` as its name). Returns
 * `true` when `compute.image` is a pinned UUID (the operator chose a specific
 * image, so there's nothing to bake-gate on), and `false`/best-effort on a
 * Scaleway error so a hiccup never blocks the prompt.
 */
export async function computeImageExists(opts: {
  secretKey: string
  zone: string
  environment: Environment
  projectId?: string
}): Promise<boolean> {
  const name = computeImageName(opts.environment)
  if (IMAGE_UUID_RE.test(name)) return true
  try {
    const { exists } = await lookupImageByName({ secretKey: opts.secretKey, zone: opts.zone, name, projectId: opts.projectId })
    return exists
  } catch {
    return false
  }
}


/** Result of a bake: the stable image name + the freshly baked image UUID. */
export interface BakeResult {
  ok: boolean
  imageName?: string
  imageUuid?: string
}

/**
 * Bake the compute VM image (Docker + Node 24 + cella-boot-agent) with Packer,
 * using an already-built provider env. Driven by the fresh-bootstrap flow
 * (actions/setup.ts).
 *
 * The image carries a STABLE name; the Pulumi program resolves the newest image
 * with that name at deploy time (resources/compute.ts), so a re-bake is picked
 * up on the next deploy with no config edit. The build runs a temporary builder
 * VM in `zone` (which must match the deploy zone — image lookup is zonal).
 */
export async function bakeComputeImage(opts: { env: NodeJS.ProcessEnv; zone: string }): Promise<BakeResult> {
  if (spawnSync('packer', ['version'], { stdio: 'ignore' }).status !== 0) {
    console.error(`${warningMark} packer CLI not found. Install: brew install hashicorp/tap/packer`)
    return { ok: false }
  }

  const env: NodeJS.ProcessEnv = { ...opts.env, PKR_VAR_zone: opts.zone }

  console.info(`\n→ Packer init (idempotent)`)
  const init = spawnSync('pnpm', ['run', 'image:init'], { cwd: infraDir, env, stdio: 'inherit' })
  if (init.status !== 0) {
    console.error(`\n${warningMark} packer init failed (exit ${init.status}).`)
    return { ok: false }
  }

  console.info(`\n→ Build boot agent + bake image (zone ${opts.zone}) — this provisions a temporary builder VM and can take ~10–15 min`)
  const build = spawnSync('pnpm', ['run', 'image:build'], { cwd: infraDir, env, stdio: 'inherit' })
  if (build.status !== 0) {
    console.error(`\n${warningMark} image build failed (exit ${build.status}).`)
    return { ok: false }
  }

  // Packer's manifest post-processor writes the artifact id as `<zone>:<uuid>`.
  const manifestPath = resolve(infraDir, 'image-manifest.json')
  if (!existsSync(manifestPath)) {
    console.warn(`  ${warningMark} image baked but image-manifest.json not found — cannot report the UUID.`)
    return { ok: true }
  }
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      builds?: Array<{ artifact_id?: string; custom_data?: { image_name?: string } }>
    }
    const lastBuild = manifest.builds?.at(-1)
    const imageUuid = lastBuild?.artifact_id?.split(':').at(-1)
    const imageName = lastBuild?.custom_data?.image_name
    return { ok: true, imageName, imageUuid }
  } catch {
    return { ok: true }
  }
}
