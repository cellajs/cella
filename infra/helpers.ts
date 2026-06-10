/**
 * Pulumi helpers — binds shared appConfig + stack config to the Pulumi runtime.
 *
 * This file MUST run inside a Pulumi program (`pulumi up/preview/destroy`); it
 * calls `pulumi.getStack()` and `new pulumi.Config(...)`. Standalone scripts
 * should import the pure derivations from `./naming` instead.
 */
import * as pulumi from '@pulumi/pulumi'
import { deriveInfra } from './naming.js'
import { servicesByName, type ServiceName } from './lib/services.js'

// Derive APP_MODE from the Pulumi stack name so appConfig picks the right env
// without a manual env var. Must run BEFORE importing shared.
// (e.g. 'organization/infra/production' → 'production')
process.env.APP_MODE = pulumi.getStack().split('/').pop() ?? 'production'

const { appConfig } = await import('../shared')

const derived = deriveInfra(appConfig)

export const {
  naming,
  domains,
  appUrls,
  region,
  zone,
  tags,
  s3Host,
  mode,
  securityEmail,
  isProduction,
  hasDomain,
} = derived

export { appConfig }

/** Pulumi stack config for infrastructure-specific values (sizing, secrets) */
export const infraConfig = new pulumi.Config('infra')

// ---------------------------------------------------------------------------
// Mode-aware defaults — forks only need to set secrets + scaleway:projectId
// ---------------------------------------------------------------------------

// Compute is on by default. It is only skipped while the bootstrap tooling is
// mid-flight — the bootstrap command sets `bootstrap:applyInProgress` before the initial
// `pulumi up` (registry has no images yet, VMs would crash-loop) and during
// "Apply infra change" mode, and clears it via a verbatim stack-file restore.
// Treating its presence as the gate means a stray local `pulumi up` cannot
// silently tear down compute the way a missing `deployCompute=true` would.
const bootstrapInProgress = new pulumi.Config('bootstrap').get('applyInProgress') !== undefined

// Fleet-wide default VM size. Per-service sizes (incl. per-mode) live in the
// canonical registry (services-config.ts `instanceType`) so a fork resizes its
// fleet by editing that one file; backend runs a larger box in production
// because its blue-green roll runs OLD + NEW slots side-by-side and needs ~2×
// the steady-state RAM during cutover — DEV1-S (2 GB) cannot hold both.
// See infra/INFRA_ARCHITECTURE.md (Zero-downtime deploys).
const FLEET_INSTANCE_TYPE = 'DEV1-S'

// Per-service VM size resolution, highest precedence first:
//   1. operator override  — pulumi config set --path infra:instanceTypes.<slug>
//   2. registry default   — services-config.ts `instanceType` (forks edit here;
//                           may be a single size or a per-mode map)
//   3. fleet default      — infra:instanceType override, else FLEET_INSTANCE_TYPE
// e.g.: pulumi config set infra:instanceType GP1-S  # whole fleet
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
  // Edge Services is the legacy SPA pipeline (S3 website + managed cert),
  // superseded by a Caddy reverse-proxy on the `frontend` VM behind the LB.
  // Off by default; enable only to keep the old path alive as a rollback option.
  enableEdgeServices: infraConfig.getBoolean('enableEdgeServices') ?? false,
  instanceType: baseInstanceType,
  /** VM size for a given service — operator override, else registry default, else fleet default. */
  instanceTypeFor: (serviceName: string): string =>
    instanceTypeOverrides[serviceName] ?? registryInstanceType(serviceName) ?? baseInstanceType,
  computeEnabled: !bootstrapInProgress,
}

