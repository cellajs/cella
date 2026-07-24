import * as pulumi from '@pulumi/pulumi'
import { composeConfig } from '../compose/compose'
import type { ServiceName } from '../compose/compose'
import { frontendCsp } from '../lib/frontend-csp'
import { servicesByName, type ServiceDefinition } from '../lib/services'
import { endpoints, mode, region, serviceUrl } from '../pulumi-context'
import { internalLbPort, lbInternalAddress } from './lb-internal'
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

// Registry bindings resolve `@{<slug>.url|privateIp|port}` from endpoint data.
// `@{self.<prop>}` resolves the consuming service's own value.
const BINDING_RE = /@\{([a-z]+)\.([a-zA-Z]+)\}/g
const endpointBySlug = new Map(endpoints.map((e) => [e.slug, e]))

/** Current-generation private-network IP supplier, owned by compute.ts. */
export type CurrentGenBindingIp = (slug: ServiceName) => pulumi.Output<string>

/** The compose `*_TAG` variable a service's image reference reads, e.g. backend to BACKEND_TAG. */
function tagVar(slug: string): string {
  return `${slug.toUpperCase()}_TAG`
}

/** Co-hosting context for the singleVM env fold (see publishCoHostedEnv in
 *  compose/infrastructure.ts): the host VM must also resolve the folded
 *  workers' registry `bindings`, with the host's own privateIp collapsed to
 *  loopback. Injected by compute.ts (which owns the generation state) so this
 *  module stays import-cycle-free and unit-testable. */
export interface CoHostingContext {
  hostSlug: ServiceName | undefined
  coHosted: readonly ServiceDefinition[]
}

/**
 * Build the per-service compose-env builder from registry placeholders,
 * registry `bindings`, and the shared env pool.
 */
export function createComposeEnvBuilder(currentGenBindingIp: CurrentGenBindingIp, coHosting?: CoHostingContext) {
  function bindingPart(selfSlug: ServiceName, target: string, prop: string, loopbackSlug?: ServiceName): pulumi.Input<string> {
    const slug = (target === 'self' ? selfSlug : target) as ServiceName
    const definition = servicesByName.get(slug)
    if (!definition) throw new Error(`compute: binding @{${target}.${prop}} on '${selfSlug}' references unknown service '${slug}'.`)
    switch (prop) {
      case 'privateIp':
        // A folded worker dialing its own host resolves to loopback: worker and
        // host share one process, and the VM's private NIC may not be attached
        // yet when the in-process worker starts dialing at boot.
        if (slug === loopbackSlug) return '127.0.0.1'
        return currentGenBindingIp(slug)
      case 'port':
        return String(definition.healthPort)
      // Stable service address through the LB's ACL-guarded internal frontend:
      // survives every cutover, so consumers never bake a generation IP. The
      // folded-worker loopback shortcut collapses host+port together to the
      // in-process app (no LB hop inside one VM).
      case 'internalHost':
        if (slug === loopbackSlug) return '127.0.0.1'
        if (!definition.internalRoute) throw new Error(`compute: binding @{${target}.internalHost} on '${selfSlug}' — service '${slug}' has no internalRoute.`)
        return lbInternalAddress
      case 'internalPort':
        if (slug === loopbackSlug) return String(definition.healthPort)
        if (!definition.internalRoute) throw new Error(`compute: binding @{${target}.internalPort} on '${selfSlug}' — service '${slug}' has no internalRoute.`)
        return String(internalLbPort(definition.healthPort))
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
  function resolveBinding(selfSlug: ServiceName, template: string, loopbackSlug?: ServiceName): pulumi.Input<string> {
    const parts: pulumi.Input<string>[] = []
    let last = 0
    for (const match of template.matchAll(BINDING_RE)) {
      parts.push(template.slice(last, match.index))
      parts.push(bindingPart(selfSlug, match[1]!, match[2]!, loopbackSlug))
      last = match.index + match[0].length
    }
    parts.push(template.slice(last))
    return pulumi.all(parts).apply((vals) => vals.join(''))
  }

  /** A binding owned by the service itself or folded in from a co-hosted worker.
   *  `self` in a folded template still means the WORKER (e.g. mcp's
   *  `@{self.url}`), and `loopback` collapses the host's privateIp to 127.0.0.1. */
  interface EffectiveBinding {
    template: string
    owner: ServiceName
    loopbackSlug?: ServiceName
  }

  /** The service's own bindings, unioned. On the singleVM host. With every
   *  folded worker's bindings (their env now lives on the host block, see
   *  publishCoHostedEnv). Conflicting templates for one var fail loudly. */
  function effectiveBindings(svc: ServiceDefinition): Record<string, EffectiveBinding> {
    const bindings: Record<string, EffectiveBinding> = {}
    for (const [name, template] of Object.entries(svc.bindings ?? {})) {
      bindings[name] = { template, owner: svc.slug }
    }
    if (!coHosting || svc.slug !== coHosting.hostSlug) return bindings
    for (const worker of coHosting.coHosted) {
      for (const [name, template] of Object.entries(worker.bindings ?? {})) {
        const existing = bindings[name]
        if (existing && existing.template !== template) {
          throw new Error(
            `compute: co-hosted binding '${name}' on '${worker.slug}' (${template}) conflicts with '${existing.owner}' (${existing.template}) — folded workers must not overload a host binding.`,
          )
        }
        bindings[name] = { template, owner: worker.slug, loopbackSlug: svc.slug }
      }
    }
    return bindings
  }

  /** Placeholder names sourced from registry services that are coHosted-flagged
   *  but NOT active in this deploy (e.g. a disabled mcp). publishCoHostedEnv
   *  folds co-hosted env into the host block unconditionally (the compose file
   *  is shared across deploy modes), so the host's placeholder scan sees their
   *  `${VAR}`s: but no in-process worker will ever read them, so one that is
   *  otherwise unresolvable is skipped because no in-process worker reads it. */
  function inactiveCoHostedVars(): Set<string> {
    const active = new Set((coHosting?.coHosted ?? []).map((s) => s.slug))
    const vars = new Set<string>()
    for (const svc of servicesByName.values()) {
      if (!svc.coHosted || active.has(svc.slug)) continue
      for (const name of composePlaceholders(svc.slug)) vars.add(name)
      for (const name of Object.keys(svc.bindings ?? {})) vars.add(name)
    }
    return vars
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
    const bindings = effectiveBindings(svc)
    const skippable = coHosting && slug === coHosting.hostSlug ? inactiveCoHostedVars() : new Set<string>()
    for (const name of composePlaceholders(slug)) {
      if (INJECTED_VARS.has(name) || name.endsWith('_TAG')) continue
      const binding = bindings[name]
      if (binding) {
        env[name] = () => resolveBinding(binding.owner, binding.template, binding.loopbackSlug)
        continue
      }
      const supply = envPool[name]
      if (!supply) {
        if (skippable.has(name)) continue
        throw new Error(
          `compute: service '${slug}' references \${${name}} in its compose blocks but no binding or envPool supplier defines a value for it — add a binding in config/services.config.ts or a supplier in resources/compose-env.ts.`,
        )
      }
      env[name] = supply
    }
    return env
  }
}
