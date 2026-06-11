/**
 * Pulumi helpers — binds shared appConfig + stack config to the Pulumi runtime.
 *
 * This file MUST run inside a Pulumi program (`pulumi up/preview/destroy`); it
 * calls `pulumi.getStack()` and `new pulumi.Config(...)`. Standalone scripts
 * should import the pure derivations from `./naming` instead.
 */
import * as pulumi from '@pulumi/pulumi'
import { deriveInfra } from './naming'
import { serviceEndpoints, servicesByName, type ServiceName } from './lib/services'

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
// Mode-aware defaults — forks only need to set secrets + scaleway:projectId
// ---------------------------------------------------------------------------

// Compute is on by default. It is skipped only while bootstrap tooling is
// mid-flight: bootstrap sets `bootstrap:applyInProgress` before the initial
// `pulumi up` (registry has no images yet, VMs would crash-loop) and during
// "Apply infra change" mode, then clears it via a verbatim stack-file restore.
// Gating on this marker stops a stray local `pulumi up` from tearing down
// compute the way a missing `deployCompute=true` would.
const bootstrapInProgress = new pulumi.Config('bootstrap').get('applyInProgress') !== undefined

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
  computeEnabled: !bootstrapInProgress,
}

// ---------------------------------------------------------------------------
// VM reader credentials — dedicated minimal-privilege key for service VMs.
//
// VMs must not hold the operator/CI key (which has write access to instances,
// the load balancer, IAM, etc.). Instead they use a `<slug>-vm-reader` IAM
// application with only ContainerRegistryReadOnly + ObjectStorageReadOnly +
// SecretManagerReadOnly + SecretManagerSecretAccess. These values are written to
// the stack by the bootstrap "Rotate CI" flow (tasks/setup-vm-key.ts).
//
// requireSecret: fail at `pulumi preview` rather than silently embedding the
// operator key into cloud-init, which would surface as a runtime security issue
// only after VMs are created.
// ---------------------------------------------------------------------------
export const vmAccessKey = !bootstrapInProgress
  ? infraConfig.requireSecret('vmAccessKey')
  : pulumi.secret('')
export const vmSecretKey = !bootstrapInProgress
  ? infraConfig.requireSecret('vmSecretKey')
  : pulumi.secret('')

