/**
 * Pulumi context — binds shared appConfig + stack config to the Pulumi runtime.
 *
 * This file MUST run inside a Pulumi program (`pulumi up/preview/destroy`); it
 * calls `pulumi.getStack()` and `new pulumi.Config(...)`. Standalone scripts
 * should import the pure derivations from `./lib/naming` instead.
 */
import * as pulumi from '@pulumi/pulumi'
import * as scaleway from '@pulumiverse/scaleway'
import generalConfig from './config/general.config'
import type { Environment } from './lib/bootstrap-stack-state'
import { resolvePerMode } from './lib/general-config'
import { deriveInfra } from './lib/naming'
import { serviceEndpoints, servicesByName } from './lib/services'
import type { ServiceName } from './compose/compose'
import { secretManagerPath, VM_READER_SECRET_NAME, type VmReaderKeyPayload } from './lib/vm-reader-secret'

// Derive APP_MODE from the Pulumi stack name (e.g. 'organization/infra/production'
// → 'production') so appConfig picks the right env. Must run BEFORE importing shared.
process.env.APP_MODE = pulumi.getStack().split('/').pop() ?? 'production'

const { appConfig } = await import('../shared')

const derived = deriveInfra(appConfig)

export const { naming, dnsZone, region, zone, tags, isProduction } = derived

// Deploys are never run against a localhost config — fail fast here instead of
// letting each resource module gate on `hasDomain` independently. The pure
// `hasDomain` derivation stays in lib/naming.ts for the bootstrap CLI's pre-deploy
// checks; inside the Pulumi program a real domain is simply a requirement.
if (!derived.hasDomain) {
  throw new Error(
    `Pulumi deploys require a real appConfig.domain (got '${appConfig.domain}'). Configure the domain for mode '${appConfig.mode}' before deploying.`,
  )
}

// Pure appConfig pass-throughs — exposed here so resource modules import mode
// from one place (the Pulumi binding layer) rather than from lib/naming.ts.
export const mode = appConfig.mode

// Per-service public endpoints (host + URL), derived from the service registry
// by slug.
export const endpoints = serviceEndpoints(appConfig)
const endpointBySlug = new Map(endpoints.map((e) => [e.slug, e]))

/** Public hostname for a service slug (throws for internal-only services like cdc). */
export function serviceHost(slug: ServiceName): string {
  const endpoint = endpointBySlug.get(slug)
  if (!endpoint) throw new Error(`Service '${slug}' has no public endpoint (internal-only?)`)
  return endpoint.host
}

export { appConfig }

/** Pulumi stack config for infrastructure-specific values (sizing, secrets) */
export const infraConfig = new pulumi.Config('infra')

/**
 * Scaleway project id — the single source for the Pulumi program. Both deploy
 * paths inject `SCW_DEFAULT_PROJECT_ID` (CI from the synced `SCW_PROJECT_ID`
 * secret in deploy.yml; the infra CLI's apply/preview from stack context), so
 * the program requires it strictly instead of carrying fallback chains.
 */
export const projectId: string = (() => {
  const id = process.env.SCW_DEFAULT_PROJECT_ID
  if (!id) {
    throw new Error('SCW_DEFAULT_PROJECT_ID is not set — run deploys via CI or the infra CLI, which inject it from the single source of truth.')
  }
  return id
})()

// ---------------------------------------------------------------------------
// Derived IAM identities — materialized from the Scaleway IAM API at run time
// rather than pinned in stack config (SOVRUN §3.3, "materialized, not stored").
//
// The bootstrap CLI mints these applications under deterministic names
// (`<slug>-ci-deploy`, `<slug>-vm-reader`) BEFORE the first `pulumi up`, so a
// name lookup is authoritative and the git file no longer caches their ids.
// These are IAM *reads*, which both the operator bootstrap key and the CI
// deploy key can perform (CI's "Verify VM reader IAM grant" step already does).
// ---------------------------------------------------------------------------

// The IAM application lookup is org-scoped. Prefer an explicit organization id
// from the environment (CI sets SCW_DEFAULT_ORGANIZATION_ID from the synced
// SCW_ORGANIZATION_ID secret; the CLI's apply flow resolves and injects it
// best-effort) so the deploy never touches the Account API — the
// least-privilege CI deploy key can read IAM but NOT `read project`. Only when
// no org id is in the environment (e.g. local runs) do we resolve it from the
// project (the in-program equivalent of the bootstrap CLI's resolveOrgId REST
// call), so a name lookup never sends an empty org id.
const envOrganizationId = process.env.SCW_DEFAULT_ORGANIZATION_ID
export const organizationId: pulumi.Input<string> = envOrganizationId
  ? envOrganizationId
  : scaleway.account.getProjectOutput({ projectId }).apply((project) => {
      if (!project.organizationId) throw new Error(`Could not resolve organization id from project '${projectId}'.`)
      return project.organizationId
    })

/** CI deploy application id — the `<slug>-ci-deploy` principal CI authenticates as. */
export const ciDeployApplicationId = scaleway.iam
  .getApplicationOutput({ name: `${appConfig.slug}-ci-deploy`, organizationId })
  .apply((app) => {
    if (!app.applicationId) throw new Error(`IAM application '${appConfig.slug}-ci-deploy' not found — run the infra CLI bootstrap first.`)
    return app.applicationId
  })

/** VM reader application id — the `<slug>-vm-reader` principal baked into service VMs. */
export const vmReaderApplicationId = scaleway.iam
  .getApplicationOutput({ name: `${appConfig.slug}-vm-reader`, organizationId })
  .apply((app) => {
    if (!app.applicationId) throw new Error(`IAM application '${appConfig.slug}-vm-reader' not found — run the infra CLI bootstrap first.`)
    return app.applicationId
  })

// ---------------------------------------------------------------------------
// Mode-aware defaults — forks only need to set secrets + scaleway:projectId
// ---------------------------------------------------------------------------

// Compute is on by default. It is deferred only during a FRESH provision: the
// bootstrap CLI sets `bootstrap:computeDeferred` before the very first
// `pulumi up` (the registry has no images yet, so VMs would crash-loop) and
// clears it once base infra exists. An "Apply infra change" run on an already
// bootstrapped stack must NOT set this — it would tear down live compute.
// Gating on this marker also stops a stray local `pulumi up` mid-fresh-bootstrap
// from declaring compute before images are pushed.
const computeDeferred = new pulumi.Config('bootstrap').get('computeDeferred') !== undefined

// VM size is per-service only — declared in the canonical registry
// (config/services.config.ts `instanceType`, required on every service) and
// resolved here for the current deploy mode. There is no fleet-wide knob and no
// Pulumi config override: resizing a box is a one-line edit to the registry
// followed by a normal CI deploy. Backend runs a larger box in production
// because its blue-green roll holds OLD + NEW slots side-by-side during cutover,
// which DEV1-S (2 GB) cannot fit. See infra/README.md (Zero-downtime deploys).
const registryInstanceType = (serviceName: string): string => {
  const size = servicesByName.get(serviceName as ServiceName)?.instanceType
  if (size === undefined) throw new Error(`Service '${serviceName}' has no instanceType in the registry (config/services.config.ts).`)
  if (typeof size === 'string') return size
  const sized = size[mode as 'production' | 'staging']
  if (sized === undefined) throw new Error(`Service '${serviceName}' has no instanceType for mode '${mode}' in the registry (config/services.config.ts).`)
  return sized
}

export const infra = {
  // Non-service capacity/feature knobs — values live in the fork-owned
  // config/general.config.ts, resolved here for the active deploy mode.
  computeImage: resolvePerMode(generalConfig.compute.image, mode as Environment),
  dbNodeType: resolvePerMode(generalConfig.database.nodeType, mode as Environment),
  dbVolumeSize: resolvePerMode(generalConfig.database.volumeSizeGb, mode as Environment),
  enableWaf: resolvePerMode(generalConfig.waf.enabled, mode as Environment),
  enableEdgeServices: resolvePerMode(generalConfig.edgeServices.enabled, mode as Environment),
  assetRetentionDays: resolvePerMode(generalConfig.assets.retentionDays, mode as Environment),
  /** VM size for a given service — resolved from the registry for the current mode. */
  instanceTypeFor: (serviceName: string): string => registryInstanceType(serviceName),
  computeEnabled: !computeDeferred,
}

// ---------------------------------------------------------------------------
// VM reader credentials — minimal-privilege key for registry pull and Secret
// Manager access. Never the operator/CI key.
//
// VMs must not hold the operator/CI key (which has write access to instances,
// the load balancer, IAM, etc.). Instead they use a `<slug>-vm-reader` IAM
// application with only ContainerRegistryReadOnly + SecretManagerReadOnly +
// SecretManagerSecretAccess.
//
// The key pair lives in Scaleway Secret Manager (seeded by the bootstrap CLI),
// NOT in stack config (SOVRUN §3.3). We read the latest version here — the
// deploy actor (operator/CI key) holds SecretManagerSecretAccess — and bake the
// values into VM cloud-init via resources/compute.ts. The container is resolved
// by name+path (one infra secret path per stack) and the payload is JSON
// `{ accessKey, secretKey }`, base64-encoded by the Secret Manager API.
//
// Skipped while compute is deferred during a fresh provision: the marker means
// compute is gated off (helpers exports empty secrets), so there is nothing to
// bake and the secret may not exist yet on the very first `pulumi up`.
// ---------------------------------------------------------------------------
function readVmReaderKey(): { accessKey: pulumi.Output<string>; secretKey: pulumi.Output<string> } {
  const secretPath = secretManagerPath(naming.slug, mode)
  const container = scaleway.secrets.getSecretOutput({ name: VM_READER_SECRET_NAME, path: secretPath, region })
  const payload = scaleway.secrets.getVersionOutput({ secretId: container.id, revision: 'latest', region }).data.apply(
    (data) => JSON.parse(Buffer.from(data, 'base64').toString('utf8')) as VmReaderKeyPayload,
  )
  return { accessKey: pulumi.secret(payload.accessKey), secretKey: pulumi.secret(payload.secretKey) }
}

const vmReaderKey = computeDeferred ? undefined : readVmReaderKey()
export const vmAccessKey = vmReaderKey?.accessKey ?? pulumi.secret('')
export const vmSecretKey = vmReaderKey?.secretKey ?? pulumi.secret('')

