/**
 * Pulumi helpers — binds shared appConfig + stack config to the Pulumi runtime.
 *
 * This file MUST run inside a Pulumi program (`pulumi up/preview/destroy`); it
 * calls `pulumi.getStack()` and `new pulumi.Config(...)`. Standalone scripts
 * should import the pure derivations from `./naming` instead.
 */
import * as pulumi from '@pulumi/pulumi'
import { deriveInfra } from './naming.js'

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

/** Pulumi stack config for infrastructure-specific values (sizing, secrets) */
export const infraConfig = new pulumi.Config('infra')

// ---------------------------------------------------------------------------
// Mode-aware defaults — forks only need to set secrets + scaleway:projectId
// ---------------------------------------------------------------------------

// `instanceType` is the fleet-wide default VM size; `instanceTypes` holds
// per-service overrides keyed by service name (backend/cdc/yjs/ai/frontend).
// Backend defaults to a larger box in production because its blue-green roll
// runs OLD + NEW slots side-by-side and needs ~2× the steady-state RAM during
// cutover — DEV1-S (2 GB) cannot hold both.
// See infra/INFRA_ARCHITECTURE.md (Zero-downtime deploys).
const sizingDefaults = isProduction
  ? {
      dbNodeType: 'DB-DEV-S',
      dbVolumeSize: 10,
      instanceType: 'DEV1-S',
      instanceTypes: { backend: 'DEV1-M' } as Record<string, string>,
      enableWaf: true,
      enableEdgeServices: false,
    }
  : {
      dbNodeType: 'DB-DEV-S',
      dbVolumeSize: 10,
      instanceType: 'DEV1-S',
      instanceTypes: {} as Record<string, string>,
      enableWaf: false,
      enableEdgeServices: false,
    }

// Compute is on by default. It is only skipped while the bootstrap tooling is
// mid-flight — bootstrap.ts sets `bootstrap:applyInProgress` before the initial
// `pulumi up` (registry has no images yet, VMs would crash-loop) and during
// "Apply infra change" mode, and clears it via try/finally + signal handlers.
// Treating its presence as the gate means a stray local `pulumi up` cannot
// silently tear down compute the way a missing `deployCompute=true` would.
const bootstrapInProgress = new pulumi.Config('bootstrap').get('applyInProgress') !== undefined

// Fleet-wide default size, plus per-service overrides merged on top of the
// mode defaults. Override via Pulumi config, e.g.:
//   pulumi config set infra:instanceType DEV1-S          # fleet default
//   pulumi config set --path infra:instanceTypes.backend DEV1-M
const baseInstanceType = infraConfig.get('instanceType') ?? sizingDefaults.instanceType
const instanceTypeOverrides: Record<string, string> = {
  ...sizingDefaults.instanceTypes,
  ...(infraConfig.getObject<Record<string, string>>('instanceTypes') ?? {}),
}

export const infra = {
  dbNodeType: infraConfig.get('dbNodeType') ?? sizingDefaults.dbNodeType,
  dbVolumeSize: infraConfig.getNumber('dbVolumeSize') ?? sizingDefaults.dbVolumeSize,
  enableWaf: infraConfig.getBoolean('enableWaf') ?? sizingDefaults.enableWaf,
  // Edge Services is the legacy SPA pipeline (S3 website + managed cert),
  // superseded by a Caddy reverse-proxy on the `frontend` VM behind the LB.
  // Off by default; enable only to keep the old path alive as a rollback option.
  enableEdgeServices: infraConfig.getBoolean('enableEdgeServices') ?? sizingDefaults.enableEdgeServices,
  instanceType: baseInstanceType,
  /** VM size for a given service — per-service override or the fleet default. */
  instanceTypeFor: (serviceName: string): string => instanceTypeOverrides[serviceName] ?? baseInstanceType,
  computeEnabled: !bootstrapInProgress,
}

