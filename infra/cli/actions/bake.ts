import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { input } from '@inquirer/prompts'
import pc from 'shared/cli-utils/colors'
import { checkMark, warningMark } from 'shared/console'
import { buildProviderEnv } from '../../lib/bootstrap-scw-env'
import { infraDir } from '../../lib/paths'
import { maskedSecret } from '../prompts/masked-secret'
import { type InfraContext, resolveVerifiedPassphrase } from '../shared'

/** Result of a bake: the stable image name + the freshly baked image UUID. */
export interface BakeResult {
  ok: boolean
  imageName?: string
  imageUuid?: string
}

/**
 * Bake the compute VM image (Docker + Node 24 + cella-boot-agent) with Packer,
 * using an already-built provider env. Shared by the CLI's "Bake compute image"
 * mode and the fresh-bootstrap flow so both bake identically.
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

/** Print the post-bake summary, including how the image is consumed. */
function reportBake(result: BakeResult): void {
  if (!result.imageUuid) {
    console.info(`\n${checkMark} ${pc.bold('Image baked.')}`)
    return
  }
  console.info(
    `\n${checkMark} ${pc.bold(pc.greenBright('Image baked.'))} ${result.imageName ? `${pc.cyanBright(result.imageName)} ` : ''}${pc.dim(`(${result.imageUuid})`)}`,
  )
  console.info(
    `  ${pc.dim('The next deploy uses it automatically — `compute.image` is the stable image name and the program resolves the newest match. Set the UUID in general.config.ts only to pin/rollback.')}`,
  )
}

/**
 * "Bake compute image" CLI mode — bake the service-VM base image with Packer.
 * Independent of stack state (it only needs Scaleway credentials + a project),
 * so it works during the first bootstrap and any time the agent/image changes.
 */
export async function runBake(context: InfraContext): Promise<void> {
  console.info(pc.dim('\nBake compute image: builds the boot agent + bakes the Docker/Node/agent VM image with Packer. No stack changes.\n'))

  // A bootstrap key is appropriate here (image creation needs instance write).
  // The passphrase is not required to bake, but resolving it keeps the prompt
  // flow consistent and validates the operator is on the right stack.
  await resolveVerifiedPassphrase(context.stackYaml).catch(() => '')

  const { projectId, appConfig } = context
  const accessKey =
    process.env.SCW_ACCESS_KEY ||
    process.env.SCW_BOOTSTRAP_ACCESS_KEY ||
    (await input({ message: 'Scaleway access key (needs instance write to bake an image)', validate: (v) => !!v.trim() || '(required)' }))
  const secretKey =
    process.env.SCW_SECRET_KEY || process.env.SCW_BOOTSTRAP_SECRET_KEY || (await maskedSecret({ message: 'Scaleway secret key' }))

  const env = buildProviderEnv(infraDir, { accessKey, secretKey, projectId, passphrase: process.env.PULUMI_CONFIG_PASSPHRASE ?? '' })
  const zone = `${appConfig.s3.region}-1`

  const result = await bakeComputeImage({ env, zone })
  if (!result.ok) process.exit(1)
  reportBake(result)
}
