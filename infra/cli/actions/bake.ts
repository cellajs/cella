import { spawnSync } from 'node:child_process'
import { input } from '@inquirer/prompts'
import pc from 'shared/cli-utils/colors'
import { checkMark, warningMark } from 'shared/console'
import generalConfig from '../../config/general.config'
import { archiveComputeImagesByName } from '../../lib/archive-compute-image'
import { buildProviderEnv } from '../../lib/bootstrap-scw-env'
import { resolvePerMode } from '../../lib/general-config'
import { infraDir } from '../../lib/paths'
import { maskedSecret } from '../prompts/masked-secret'
import { envOr, type InfraContext } from '../shared'

const IMAGE_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Bake the compute VM image (Docker + the self-contained cella-boot-agent) with
 * Packer, using an already-built provider env. Driven by the fresh-bootstrap flow
 * (actions/setup.ts) and the "Bake compute image" CLI mode (runBake below).
 *
 * The image carries a STABLE name; the Pulumi program resolves the newest image
 * with that name at deploy time (resources/compute.ts), so a re-bake is picked
 * up on the next deploy with no config edit. The build runs a temporary builder
 * VM in `zone` (which must match the deploy zone — image lookup is zonal).
 *
 * The Scaleway Packer builder refuses to create an image whose name already
 * exists, so before building we rename any current image holding the stable name
 * out of the way (kept for UUID rollback). `imageName` is also pinned into Packer
 * (PKR_VAR_image_name) so the archived name and the freshly baked name are always
 * the single value resolved from config — no drift against the HCL default.
 */
export async function bakeComputeImage(opts: { env: NodeJS.ProcessEnv; zone: string; imageName: string }): Promise<boolean> {
  if (spawnSync('packer', ['version'], { stdio: 'ignore' }).status !== 0) {
    console.error(`${warningMark} packer CLI not found. Install: brew install hashicorp/tap/packer`)
    return false
  }

  if (IMAGE_UUID_RE.test(opts.imageName)) {
    console.error(`${warningMark} compute.image is pinned to a UUID (rollback mode); set it back to the stable name in config/general.config.ts before baking.`)
    return false
  }

  const env: NodeJS.ProcessEnv = { ...opts.env, PKR_VAR_zone: opts.zone, PKR_VAR_image_name: opts.imageName }

  // Free the stable image name: the Packer builder pre-fails on a duplicate name.
  try {
    const archived = await archiveComputeImagesByName({
      secretKey: env.SCW_SECRET_KEY ?? '',
      projectId: env.SCW_DEFAULT_PROJECT_ID ?? '',
      zone: opts.zone,
      imageName: opts.imageName,
    })
    if (archived.length > 0) {
      console.info(`\n→ Archived ${archived.length} existing image(s) named '${opts.imageName}' (retained for UUID rollback)`)
    }
  } catch (err) {
    console.error(`\n${warningMark} could not free the image name '${opts.imageName}': ${err instanceof Error ? err.message : String(err)}`)
    return false
  }

  console.info(`\n→ Packer init (idempotent)`)
  const init = spawnSync('pnpm', ['run', 'image:init'], { cwd: infraDir, env, stdio: 'inherit' })
  if (init.status !== 0) {
    console.error(`\n${warningMark} packer init failed (exit ${init.status}).`)
    return false
  }

  console.info(`\n→ Build boot agent + bake image (zone ${opts.zone}) — this provisions a temporary builder VM and can take ~10–15 min`)
  const build = spawnSync('pnpm', ['run', 'image:build'], { cwd: infraDir, env, stdio: 'inherit' })
  if (build.status !== 0) {
    console.error(`\n${warningMark} image build failed (exit ${build.status}).`)
    return false
  }
  return true
}

/**
 * "Bake compute image" CLI mode — bake the service-VM base image with Packer on
 * an already-bootstrapped stack (the fresh-bootstrap flow bakes inline). The
 * point of doing this in the CLI rather than a bare `pnpm image:build` is the
 * credential flow: Packer reads SCW_* from the shell env, which an operator
 * rarely has exported; this reuses the same bootstrap-key prompt + backend/.env
 * loading the other modes use, so the build authenticates without manual export.
 */
export async function runBake(context: InfraContext): Promise<void> {
  console.info(pc.dim('\nBake compute image: builds the boot agent + bakes the Docker/Node/agent VM image with Packer. No stack changes.\n'))

  const { projectId, appConfig } = context
  const accessKey = await envOr(['SCW_BOOTSTRAP_ACCESS_KEY', 'SCW_ACCESS_KEY'], () =>
    input({ message: 'Scaleway bootstrap access key', validate: (v) => !!v.trim() || '(required)' }),
  )
  const secretKey = await envOr(['SCW_BOOTSTRAP_SECRET_KEY', 'SCW_SECRET_KEY'], () => maskedSecret({ message: 'Scaleway bootstrap secret key' }))

  const env = buildProviderEnv(infraDir, { accessKey, secretKey, projectId, passphrase: process.env.PULUMI_CONFIG_PASSPHRASE ?? '' })
  const imageName = resolvePerMode(generalConfig.compute.image, context.environment as Parameters<typeof resolvePerMode>[1])
  const ok = await bakeComputeImage({ env, zone: `${appConfig.s3.region}-1`, imageName })
  if (!ok) process.exit(1)
  console.info(`\n${checkMark} ${pc.bold(pc.greenBright('Image baked.'))} ${pc.dim('The next compute deploy resolves it by name automatically.')}`)
}
