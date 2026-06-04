/**
 * Pure, Pulumi-free derivations from appConfig.
 *
 * Safe to import from anywhere — Pulumi modules, standalone scripts, tests.
 * Caller passes the resolved appConfig; this file does not touch process.env
 * or @pulumi/pulumi, so it has no execution-context preconditions.
 */
import type { appConfig as AppConfig } from '../shared'

type Cfg = typeof AppConfig

export interface InfraDerivations {
  naming: {
    slug: string
    prefix: string
    resource: (suffix: string) => string
    frontendBucket: string
    publicBucket: string
    privateBucket: string
    pulumiStateBucket: string
    deployTagsBucket: string
    registryNamespace: string
  }
  domains: {
    zone: string
    app: string
    api: string
    yjs: string
    ai: string
  }
  appUrls: {
    frontend: string
    backend: string
    yjs: string
    ai: string
  }
  region: string
  zone: string
  tags: string[]
  s3Host: string
  mode: Cfg['mode']
  securityEmail: string
  isProduction: boolean
  hasDomain: boolean
}

export function deriveInfra(appConfig: Cfg): InfraDerivations {
  const prefix = appConfig.slug
  const region = appConfig.s3.region

  return {
    naming: {
      slug: appConfig.slug,
      prefix,
      resource: (suffix: string) => `${prefix}-${suffix}`,
      frontendBucket: `${prefix}-frontend`,
      publicBucket: appConfig.s3.publicBucket,
      privateBucket: appConfig.s3.privateBucket,
      pulumiStateBucket: `${prefix}-pulumi-state`,
      // Holds `deploy/<service>.tag` objects (just the image SHA, plain text).
      // The on-VM reconciler watches its service's key and pulls + restarts
      // the container when the tag changes. Separate bucket so VM IAM can be
      // read-only on exactly these keys without exposing Pulumi state.
      deployTagsBucket: `${prefix}-deploy-tags`,
      // Scaleway Container Registry namespace names require >= 4 chars and no
      // hyphens. The slug is validated at config load (see config-validation),
      // so we only need to strip hyphens here.
      registryNamespace: appConfig.slug.replace(/-/g, ''),
    },
    domains: {
      zone: appConfig.domain,
      app: new URL(appConfig.frontendUrl).hostname,
      api: new URL(appConfig.backendUrl).hostname,
      yjs: new URL(appConfig.yjsUrl).hostname,
      ai: new URL(appConfig.aiUrl).hostname,
    },
    appUrls: {
      frontend: appConfig.frontendUrl,
      backend: appConfig.backendUrl,
      yjs: appConfig.yjsUrl,
      ai: appConfig.aiUrl,
    },
    region,
    zone: `${region}-1`,
    tags: [`env=${appConfig.mode}`, `app=${appConfig.slug}`, 'managed-by=pulumi'],
    s3Host: appConfig.s3.host,
    mode: appConfig.mode,
    securityEmail: appConfig.securityEmail,
    isProduction: appConfig.mode === 'production',
    hasDomain: Boolean(appConfig.domain && appConfig.domain !== 'localhost'),
  }
}
