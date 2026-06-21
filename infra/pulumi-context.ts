import * as pulumi from '@pulumi/pulumi'
import * as scaleway from '@pulumiverse/scaleway'
import { appConfig } from '../shared'
import generalConfig from './config/general.config'
import type { Environment } from './lib/bootstrap-stack-state'
import { resolvePerMode } from './lib/general-config'
import { deriveInfra } from './lib/naming'
import { serviceEndpoints, servicesByName } from './lib/services'
import type { ServiceName } from './compose/compose'
import { secretManagerPath, VM_READER_SECRET_NAME, type VmReaderKeyPayload } from './lib/vm-reader-secret'

const stackMode = pulumi.getStack().split('/').pop()

// Make sure the stack mode matches the appConfig.mode
if (appConfig.mode !== stackMode) {
  throw new Error(
    `APP_MODE resolved to '${appConfig.mode}' but the Pulumi stack is '${stackMode}'. Set APP_MODE=${stackMode} before running pulumi (the infra CLI and CI do this automatically).`,
  )
}

const derived = deriveInfra(appConfig)

export const { naming, dnsZone, region, zone, tags, isProduction } = derived

// Deploys require a real domain — fail fast here instead of gating each resource
// module on `hasDomain` independently.
if (!derived.hasDomain) {
  throw new Error(
    `Pulumi deploys require a real appConfig.domain (got '${appConfig.domain}'). Configure the domain for mode '${appConfig.mode}' before deploying.`,
  )
}

// Exposed here so resource modules import mode from one place.
export const mode = appConfig.mode

// Deploys only target production/staging; narrow once to a typed Environment so
// downstream sizing/config lookups don't need per-call assertions.
if (mode !== 'production' && mode !== 'staging') {
  throw new Error(`Pulumi deploys only support 'production' or 'staging' (got '${mode}').`)
}
const deployMode: Environment = mode

// Per-service public endpoints (host + URL), derived from the service registry by slug.
export const endpoints = serviceEndpoints(appConfig)
const endpointBySlug = new Map(endpoints.map((e) => [e.slug, e]))

/** Public hostname for a service slug (throws for internal-only services like cdc). */
export function serviceHost(slug: ServiceName): string {
  const endpoint = endpointBySlug.get(slug)
  if (!endpoint) throw new Error(`Service '${slug}' has no public endpoint (internal-only?)`)
  return endpoint.host
}

/** Pulumi stack config for infrastructure-specific values (sizing, secrets) */
export const infraConfig = new pulumi.Config('infra')

/** Reads a required Scaleway id from the env. Both deploy paths (CI and the infra
 *  CLI) inject these, so the program requires them strictly with no fallback. */
function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set — run deploys via CI or the infra CLI, which inject it from the single source of truth.`)
  return value
}

/** Scaleway project id — scopes every provider call. */
export const projectId: string = requireEnv('SCW_DEFAULT_PROJECT_ID')

/** Scaleway organization id — scopes the org-level IAM application lookups below. */
export const organizationId: string = requireEnv('SCW_DEFAULT_ORGANIZATION_ID')

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

// Compute is deferred only during a fresh provision: the
// bootstrap CLI sets `bootstrap:computeDeferred` before the first `pulumi up`
const computeDeferred = new pulumi.Config('bootstrap').get('computeDeferred') !== undefined

// VM size is per-service  — declared in config/services.config.ts
const registryInstanceType = (serviceName: string): string => {
  const size = servicesByName.get(serviceName as ServiceName)?.instanceType
  const resolved = typeof size === 'string' ? size : size?.[deployMode]
  if (resolved === undefined) throw new Error(`Service '${serviceName}' has no instanceType for mode '${mode}' in the registry (config/services.config.ts).`)
  return resolved
}

// Expose mode-aware defaults (compute image, db sizing, WAF toggle) as a single object for convenient import in resource modules.
export const infra = {
  computeImage: resolvePerMode(generalConfig.compute.image, deployMode),
  dbNodeType: resolvePerMode(generalConfig.database.nodeType, deployMode),
  dbVolumeSize: resolvePerMode(generalConfig.database.volumeSizeGb, deployMode),
  enableWaf: resolvePerMode(generalConfig.waf.enabled, deployMode),
  enableEdgeServices: resolvePerMode(generalConfig.edgeServices.enabled, deployMode),
  assetRetentionDays: resolvePerMode(generalConfig.assets.retentionDays, deployMode),
  instanceTypeFor: (serviceName: string): string => registryInstanceType(serviceName),
  computeEnabled: !computeDeferred,
}

// Reads the VM reader key pair from Scaleway Secret Manager.
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

