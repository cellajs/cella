import * as pulumi from '@pulumi/pulumi'
import { composeConfig } from '../compose/compose'
import type { ServiceName } from '../compose/compose'
import { frontendCsp } from '../lib/frontend-csp'
import { servicesByName, type ServiceDefinition } from '../lib/services'
import { endpoints, mode, region, serviceUrl } from '../pulumi-context'
import { registryEndpoint } from './registry'
import { frontendBucketName } from './storage'

/**
 * Pulumi-bound values for the `${VAR}` placeholders a service's compose blocks
 * reference. The registry declares WHICH vars a service consumes; this pool
 * binds the shared, app-wide ones (public URLs come from the endpoint
 * registry via `serviceUrl`). Service-specific wiring is declared as
 * `bindings` on the registry entry and resolved generically below.
 */
const envPool: Record<string, () => pulumi.Input<string>> = {
  FRONTEND_URL: () => serviceUrl('frontend'),
  BACKEND_URL: () => serviceUrl('backend'),
  // Frontend SPA proxy: CSP header + the S3 REST hostname Caddy proxies to.
  FRONTEND_CSP: () => frontendCsp,
  ORIGIN_HOST: () => pulumi.interpolate`${frontendBucketName}.s3.${region}.scw.cloud`,
}

// Vars satisfied outside the pool:
//  - REGISTRY / APP_MODE: universal, injected into every VM's .env;
//  - *_TAG: the baked image tag, injected per service below.
const INJECTED_VARS = new Set(['REGISTRY', 'APP_MODE'])
const PLACEHOLDER_RE = /\$\{([A-Z][A-Z0-9_]*)(?::-[^}]*)?\}/g

/** All `${VAR}` placeholders in the compose blocks that run on a service's VM. */
function composePlaceholders(slug: string): string[] {
  const vars = new Set<string>()
  for (const block of Object.values(composeConfig.services)) {
    if (!block.profiles.includes(slug)) continue
    const texts = [block.image, ...(block.ports ?? []), ...Object.values(block.environment ?? {})]
    for (const text of texts) for (const match of text.matchAll(PLACEHOLDER_RE)) vars.add(match[1]!)
  }
  return [...vars]
}

// ---------------------------------------------------------------------------
// Registry bindings: resolve `@{<slug>.<prop>}` templates from the registry's
// `bindings` field. Supported properties:
//   @{<slug>.url}: the service's public URL from the endpoint registry
//   @{<slug>.privateIp}: the service's current-generation private-network IP
//   @{<slug>.port}: the service's health/app port
//   @{self.<prop>}: the consuming service's own values
// ---------------------------------------------------------------------------

const BINDING_RE = /@\{([a-z]+)\.([a-zA-Z]+)\}/g
const endpointBySlug = new Map(endpoints.map((e) => [e.slug, e]))

/** Current-generation private-network IP supplier, owned by compute.ts. */
export type CurrentGenBindingIp = (slug: ServiceName) => pulumi.Output<string>

/** The compose `*_TAG` variable a service's image reference reads, e.g. backend to BACKEND_TAG. */
function tagVar(slug: string): string {
  return `${slug.toUpperCase()}_TAG`
}

/**
 * Build the per-service compose-env builder from registry placeholders,
 * registry `bindings`, and the shared env pool.
 */
export function createComposeEnvBuilder(currentGenBindingIp: CurrentGenBindingIp) {
  function bindingPart(selfSlug: ServiceName, target: string, prop: string): pulumi.Input<string> {
    const slug = (target === 'self' ? selfSlug : target) as ServiceName
    const definition = servicesByName.get(slug)
    if (!definition) throw new Error(`compute: binding @{${target}.${prop}} on '${selfSlug}' references unknown service '${slug}'.`)
    switch (prop) {
      case 'privateIp':
        return currentGenBindingIp(slug)
      case 'port':
        return String(definition.healthPort)
      case 'url': {
        const endpoint = endpointBySlug.get(slug)
        if (!endpoint) throw new Error(`compute: binding @{${target}.url} on '${selfSlug}' — service '${slug}' has no public endpoint.`)
        return endpoint.url
      }
      default:
        throw new Error(`compute: unknown binding property '@{${target}.${prop}}' on '${selfSlug}'.`)
    }
  }

  /** Resolve a binding template such as `ws://@{backend.privateIp}:@{backend.port}/...` to a Pulumi value. */
  function resolveBinding(selfSlug: ServiceName, template: string): pulumi.Input<string> {
    const parts: pulumi.Input<string>[] = []
    let last = 0
    for (const match of template.matchAll(BINDING_RE)) {
      parts.push(template.slice(last, match.index))
      parts.push(bindingPart(selfSlug, match[1]!, match[2]!))
      last = match.index + match[0].length
    }
    parts.push(template.slice(last))
    return pulumi.all(parts).apply((vals) => vals.join(''))
  }

  /** Compose env for one service: universal vars + the baked image tag + binding/pool values. */
  return function buildComposeEnv(svc: ServiceDefinition, releaseSha: string): Record<string, () => pulumi.Input<string>> {
    const { slug } = svc
    const env: Record<string, () => pulumi.Input<string>> = {
      REGISTRY: () => registryEndpoint,
      APP_MODE: () => mode,
      // The generation's pinned image tag: the VM pulls exactly this SHA at boot.
      [tagVar(slug)]: () => releaseSha,
    }
    for (const name of composePlaceholders(slug)) {
      if (INJECTED_VARS.has(name) || name.endsWith('_TAG')) continue
      const template = svc.bindings?.[name]
      if (template) {
        env[name] = () => resolveBinding(slug, template)
        continue
      }
      const supply = envPool[name]
      if (!supply) {
        throw new Error(
          `compute: service '${slug}' references \${${name}} in its compose blocks but no binding or envPool supplier defines a value for it — add a binding in config/services.config.ts or a supplier in resources/compose-env.ts.`,
        )
      }
      env[name] = supply
    }
    return env
  }
}
