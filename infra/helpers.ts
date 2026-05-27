/**
 * Pulumi helpers — binds shared appConfig + stack config to the Pulumi runtime.
 *
 * This file MUST run inside a Pulumi program (`pulumi up/preview/destroy`); it
 * calls `pulumi.getStack()` and `new pulumi.Config(...)`. Standalone scripts
 * should import the pure derivations from `./naming` instead.
 */
import * as pulumi from '@pulumi/pulumi'
import { deriveInfra } from './naming.js'
import { assertPinnedImageTags } from './src/image-tags.js'

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

const sizingDefaults = isProduction
  ? { dbNodeType: 'DB-DEV-S', dbVolumeSize: 10, instanceType: 'DEV1-S', enableWaf: true }
  : { dbNodeType: 'DB-DEV-S', dbVolumeSize: 10, instanceType: 'DEV1-S', enableWaf: false }

const backendImageTag = infraConfig.get('backendImageTag') ?? 'latest'

export const infra = {
  dbNodeType: infraConfig.get('dbNodeType') ?? sizingDefaults.dbNodeType,
  dbVolumeSize: infraConfig.getNumber('dbVolumeSize') ?? sizingDefaults.dbVolumeSize,
  enableWaf: infraConfig.getBoolean('enableWaf') ?? sizingDefaults.enableWaf,
  instanceType: infraConfig.get('instanceType') ?? sizingDefaults.instanceType,
  backendImageTag,
  cdcImageTag: infraConfig.get('cdcImageTag') ?? 'latest',
  yjsImageTag: infraConfig.get('yjsImageTag') ?? 'latest',
  aiWorkerImageTag: infraConfig.get('aiWorkerImageTag') ?? backendImageTag,
  deployCompute: infraConfig.getBoolean('deployCompute') ?? false,
}

// Refuse to provision VMs with mutable tags — Pulumi can't detect a registry-side
// :latest update, so a deploy would silently keep the old image.
if (infra.deployCompute) {
  assertPinnedImageTags({
    backendImageTag: infra.backendImageTag,
    cdcImageTag: infra.cdcImageTag,
    yjsImageTag: infra.yjsImageTag,
    aiWorkerImageTag: infra.aiWorkerImageTag,
  })
}
