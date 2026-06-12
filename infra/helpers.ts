/**
 * Pulumi helpers — binds shared appConfig + stack config to the Pulumi runtime.
 *
 * This file MUST run inside a Pulumi program (`pulumi up/preview/destroy`); it
 * calls `pulumi.getStack()` and `new pulumi.Config(...)`. Standalone scripts
 * should import the pure derivations from `./naming` instead.
 */
import * as pulumi from '@pulumi/pulumi'
import * as scaleway from '@pulumiverse/scaleway'
import { deriveInfra } from './naming'
import { serviceEndpoints, servicesByName, type ServiceName } from './lib/services'
import { secretManagerPath, VM_READER_SECRET_NAME, type VmReaderKeyPayload } from './lib/vm-reader-secret'

// Derive APP_MODE from the Pulumi stack name (e.g. 'organization/infra/production'
// → 'production') so appConfig picks the right env. Must run BEFORE importing shared.
process.env.APP_MODE = pulumi.getStack().split('/').pop() ?? 'production'

const { appConfig } = await import('../shared')

const derived = deriveInfra(appConfig)

export const { naming, dnsZone, region, zone, tags, isProduction, hasDomain } = derived

// Pure appConfig pass-throughs — exposed here so resource modules import mode
// from one place (the Pulumi binding layer) rather than from naming.ts.
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
// SCW_ORGANIZATION_ID secret) so the deploy never touches the Account API — the
// least-privilege CI deploy key can read IAM but NOT `read project`. Only when
// no org id is in the environment (e.g. local runs) do we resolve it from the
// project (the in-program equivalent of the bootstrap CLI's resolveOrgId REST
// call), so a name lookup never sends an empty org id.
const envOrganizationId = process.env.SCW_DEFAULT_ORGANIZATION_ID ?? process.env.SCW_ORGANIZATION_ID
export const organizationId: pulumi.Input<string> = envOrganizationId
  ? envOrganizationId
  : (() => {
      const scwProjectId =
        process.env.SCW_DEFAULT_PROJECT_ID ?? process.env.SCW_PROJECT_ID ?? new pulumi.Config('scaleway').get('projectId')
      if (!scwProjectId) {
        throw new Error(
          'Scaleway organization ID not found. Set SCW_DEFAULT_ORGANIZATION_ID (preferred) or SCW_DEFAULT_PROJECT_ID in the environment (or scaleway:projectId in stack config).',
        )
      }
      return scaleway.account.getProjectOutput({ projectId: scwProjectId }).apply((project) => {
        if (!project.organizationId) throw new Error(`Could not resolve organization id from project '${scwProjectId}'.`)
        return project.organizationId
      })
    })()

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

// Principal string for whoever runs `pulumi up` (the operator key locally, the
// CI key in CI), derived from the calling SCW_ACCESS_KEY so the deploy-tags
// bucket can grant it. `undefined` when no access key is in the environment —
// the bucket policy then omits the operator grant, matching the behaviour from
// before this value was stored (in CI the caller is already `applicationId`).
const callerAccessKey = process.env.SCW_ACCESS_KEY
export const operatorPrincipal: pulumi.Output<string> | undefined = callerAccessKey
  ? scaleway.iam.getApiKeyOutput({ accessKey: callerAccessKey }).apply((key) => (key.userId ? `user_id:${key.userId}` : `application_id:${key.applicationId}`))
  : undefined

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

// Fleet-wide default VM size. Per-service sizes (incl. per-mode) live in the
// canonical registry (compose/services.config.ts `instanceType`). Backend runs
// a larger box in production because its blue-green roll holds OLD + NEW slots
// side-by-side during cutover, which DEV1-S (2 GB) cannot fit.
// See infra/INFRA_ARCHITECTURE.md (Zero-downtime deploys).
const FLEET_INSTANCE_TYPE = 'DEV1-S'

// Per-service VM size resolution, highest precedence first:
//   1. operator override  — pulumi config set --path infra:instanceTypes.<slug>
//   2. registry default   — compose/services.config.ts `instanceType`
//   3. fleet default      — infra:instanceType override, else FLEET_INSTANCE_TYPE
const baseInstanceType = infraConfig.get('instanceType') ?? FLEET_INSTANCE_TYPE
const instanceTypeOverrides: Record<string, string> = infraConfig.getObject<Record<string, string>>('instanceTypes') ?? {}

/** Resolve a service's registry default size for the current deploy mode. */
const registryInstanceType = (serviceName: string): string | undefined => {
  const size = servicesByName.get(serviceName as ServiceName)?.instanceType
  if (typeof size === 'string' || size === undefined) return size
  return size[mode as 'production' | 'staging']
}

export const infra = {
  dbNodeType: infraConfig.get('dbNodeType') ?? 'DB-DEV-S',
  dbVolumeSize: infraConfig.getNumber('dbVolumeSize') ?? 10,
  // WAF defaults on in production only; everywhere else opt in via Pulumi config.
  enableWaf: infraConfig.getBoolean('enableWaf') ?? isProduction,
  // Edge Services is the S3-website + managed-cert SPA pipeline, superseded by a
  // Caddy reverse-proxy on the `frontend` VM behind the LB. Off by default;
  // enable only as a rollback path.
  enableEdgeServices: infraConfig.getBoolean('enableEdgeServices') ?? false,
  instanceType: baseInstanceType,
  /** VM size for a given service — operator override, else registry default, else fleet default. */
  instanceTypeFor: (serviceName: string): string =>
    instanceTypeOverrides[serviceName] ?? registryInstanceType(serviceName) ?? baseInstanceType,
  computeEnabled: !computeDeferred,
}

// ---------------------------------------------------------------------------
// VM reader credentials — minimal-privilege key for registry pull, S3 tag
// reads, and Secret Manager access. Never the operator/CI key.
//
// VMs must not hold the operator/CI key (which has write access to instances,
// the load balancer, IAM, etc.). Instead they use a `<slug>-vm-reader` IAM
// application with only ContainerRegistryReadOnly + ObjectStorageReadOnly +
// SecretManagerReadOnly + SecretManagerSecretAccess.
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

