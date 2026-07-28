import * as pulumi from '@pulumi/pulumi'
import { engineConfig } from './config/engine-config'
const appConfig = engineConfig()
import type { Environment } from './lib/stack/bootstrap-stack-state'
import { deriveInfra } from './lib/naming'
import { serviceEndpoints } from './lib/services'
import type { ServiceName } from './compose/compose'

/**
 * Stack identity and derived addressing, shared by every resource module. The
 * stack NAME is the config mode (index.ts derives APP_MODE from it before any
 * module loads the shared appConfig); everything else here is a pure derivation
 * of that identity. Provider lookups, secret reads, and sizing live with their
 * consumers (vm-iam.ts, compute.ts, config/sizing.ts).
 */
export const stackName = pulumi.getStack().split('/').pop() ?? ''

// A mismatch means APP_MODE was set explicitly and contradicts the selected
// stack; fail before any resource is declared against the wrong environment.
if (appConfig.mode !== stackName) {
  throw new Error(
    `APP_MODE resolved to '${appConfig.mode}' but the Pulumi stack is '${stackName}'. Unset APP_MODE (index.ts derives it from the stack) or select the matching stack.`,
  )
}

const derived = deriveInfra(appConfig)

export const { naming, dnsZone, region, zone, tags, tagsAsMap, isProduction } = derived

// Deploys require a real domain; validate it once before defining resources.
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
export const deployMode: Environment = mode

// Per-service public endpoints (host + URL), derived from the service registry by slug.
export const endpoints = serviceEndpoints(appConfig)
const endpointBySlug = new Map(endpoints.map((e) => [e.slug, e]))

/** Public hostname for a service slug (throws for internal-only services like cdc). */
export function serviceHost(slug: ServiceName): string {
  const endpoint = endpointBySlug.get(slug)
  if (!endpoint) throw new Error(`Service '${slug}' has no public endpoint (internal-only?)`)
  return endpoint.host
}

/** Full public URL for a service slug (throws for internal-only services like cdc). */
export function serviceUrl(slug: ServiceName): string {
  const endpoint = endpointBySlug.get(slug)
  if (!endpoint) throw new Error(`Service '${slug}' has no public endpoint (internal-only?)`)
  return endpoint.url
}

/** Reads a required Scaleway id from the env. Both deploy paths (CI and the infra
 *  CLI) inject these, so the program requires them strictly with no fallback. */
function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set — run deploys via CI or the infra CLI, which inject it from the single source of truth.`)
  return value
}

/** Scaleway project id: scopes every provider call. */
export const projectId: string = requireEnv('SCW_DEFAULT_PROJECT_ID')

/** Scaleway organization id: scopes the org-level IAM application lookups. */
export const organizationId: string = requireEnv('SCW_DEFAULT_ORGANIZATION_ID')
