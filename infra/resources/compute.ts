/**
 * Compute — one Docker Compose VM per enabled service from the canonical
 * registry (config/services.config.ts).
 *
 * Each VM has a fully-closed inbound security group and is reachable only over the
 * main private network from the load balancer and database. Cloud-init installs
 * Docker, logs into the container registry, writes the shared compose.yml + .env,
 * and starts the service-specific compose profile.
 *
 * Replacement model: any change to image tag or userdata triggers a full VM
 * replacement; LB health checks bridge the cutover. VMs replace delete-before-
 * create because their pinned public + private IPs can each attach to only one
 * server (this also keeps singleton workers from briefly running twice — see
 * the registry entries in config/services.config.ts).
 *
 * Constraint: Scaleway has no instance-attached IAM identities, so app secrets
 * and the registry-login credential are embedded in cloud-init userdata; anyone
 * with `InstancesReadOnly` on the project can read them. Break-glass access is
 * the Scaleway serial console (no SSH listener is opened).
 *
 * Credentials embedded in cloud-init use the dedicated `<slug>-vm-reader` IAM
 * application (provisioned by tasks/setup-vm-key.ts in the bootstrap Rotate keys
 * flow). That identity has only ContainerRegistryReadOnly + ObjectStorageReadOnly
 * + SecretManagerReadOnly + SecretManagerSecretAccess — no write access to any
 * Scaleway resource.
 */
import * as pulumi from '@pulumi/pulumi'
import * as scaleway from '@pulumiverse/scaleway'
import { naming, zone, region, tags, infra, mode, appConfig, endpoints, vmAccessKey, vmSecretKey } from '../pulumi-context'
import { buildInstallSnippet, buildReconcilerEnv, type ReconcilerService } from '../reconciler/index'
import { runtimeSecretsForConsumer, type RuntimeSecretConsumer } from '../lib/runtime-secrets'
import { composeConfig } from '../compose/compose'
import { enabledServices, servicesByName, type ServiceDefinition, type ServiceName } from '../lib/services'
import { frontendCsp } from '../lib/frontend-csp'
import { renderCloudInit } from './cloud-init'
import { deployTagsBucketName } from './deploy-tags'
import { privateNetworkId } from './network'
import { registryEndpoint } from './registry'
import { secretIds } from './secrets'
import { frontendBucketName } from './storage'
import { vmReaderPolicy } from './vm-iam'

// ---------------------------------------------------------------------------
// VM reader credentials — minimal-privilege key for registry pull, S3 tag
// reads, and Secret Manager access. Never the operator/CI key.
// ---------------------------------------------------------------------------

const scwSecretKey = vmSecretKey
const scwAccessKey = vmAccessKey

// ---------------------------------------------------------------------------
// Security Group — fully closed inbound; LB reaches VMs via private network.
// Break-glass access is via Scaleway's serial console (no SSH on the public
// internet). See infra/README.md → "Emergency access".
// ---------------------------------------------------------------------------

const securityGroup = new scaleway.instance.SecurityGroup('compute-sg', {
  name: naming.resource('compute-sg'),
  inboundDefaultPolicy: 'drop',
  outboundDefaultPolicy: 'accept',
  inboundRules: [],
  zone,
  tags,
})

// ---------------------------------------------------------------------------
// Shared static .env content (compose wiring only; runtime secrets are synced
// from Secret Manager into /opt/app/.env.runtime)
// ---------------------------------------------------------------------------

function buildRuntimeSecretsManifest(serviceName: string): pulumi.Output<string> {
  const definitions = runtimeSecretsForConsumer(serviceName as RuntimeSecretConsumer)
  return pulumi.all(definitions.map((definition) => secretIds[definition.id]!)).apply((ids) =>
    JSON.stringify(
      definitions.map((definition, index) => ({
        id: definition.id,
        secretName: definition.secretName,
        // Pulumi's scaleway Secret `.id` is the composite `<region>/<uuid>`.
        // The Secret Manager access URL the VM builds already carries the
        // region in its path (`/regions/<region>/secrets/<id>/...`), so we must
        // emit ONLY the bare uuid here — otherwise the VM requests
        // `/secrets/<region>/<uuid>/...` and every read 404s, failing
        // runtime-secret-sync fleet-wide.
        secretId: (ids[index] ?? '').split('/').pop(),
        envVar: definition.envVar,
        required: definition.required,
      })),
      null,
      2,
    ),
  )
}

// ---------------------------------------------------------------------------
// Compose file content (the generated deploy artifact, read at deploy time)
// ---------------------------------------------------------------------------

import * as fs from 'node:fs'
import * as path from 'node:path'

const composeContent = fs.readFileSync(
  path.resolve(import.meta.dirname, '../compose.gen.yml'),
  'utf-8',
)

// Per-VM ingress reverse-proxy config. Mounted into the `ingress` container so
// the app container can roll without dropping the LB-facing host listener.
const ingressContent = fs.readFileSync(
  path.resolve(import.meta.dirname, '../ingress.Caddyfile'),
  'utf-8',
)

// ---------------------------------------------------------------------------
// Cloud-init template
// ---------------------------------------------------------------------------

interface ServiceConfig {
  name: string
  profile: string
  /** App container's internal port; also the host port the ingress publishes. */
  port: number
  /**
   * Compose env var suppliers (REGISTRY, URLs, ingress wiring). Lazy so values
   * backed by Pulumi resources (reserved private IPs, bucket names) are only
   * resolved when VMs are actually created (`infra.computeEnabled`), not at
   * registry-scan time.
   */
  composeEnv: Record<string, () => pulumi.Input<string>>
}

function buildCloudInit(service: ServiceConfig): pulumi.Output<string> {
  const envLines = pulumi.all(
    Object.entries(service.composeEnv).map(([k, supply]) =>
      pulumi.output(supply()).apply((val) => `${k}=${val}`),
    ),
  )

  return pulumi.all([
    buildRuntimeSecretsManifest(service.name),
    envLines,
    scwSecretKey,
    scwAccessKey,
    registryEndpoint,
    deployTagsBucketName,
  ]).apply(
    ([runtimeSecretsManifest, env, secretKey, accessKey, registry, tagBucket]) => {
      const allEnv = env.join('\n')

      // Reconciler env file — single source of truth for the per-VM watcher.
      const reconcilerEnvFile = buildReconcilerEnv({
        service: service.name as ReconcilerService,
        tagBucket,
        region,
        registry,
        stateBucket: naming.pulumiStateBucket,
        awsAccessKeyId: accessKey,
        awsSecretAccessKey: secretKey,
      })
      const installReconcilerSnippet = buildInstallSnippet()

      return renderCloudInit({
        service: service.name,
        bootService: bootSlotService(service.name),
        profile: service.profile,
        envFileContent: allEnv,
        runtimeSecretsManifest,
        reconcilerEnvFile,
        installReconcilerSnippet,
        composeContent,
        ingressContent,
        registry,
        secretKey,
        accessKey,
        stateBucket: naming.pulumiStateBucket,
        region,
      })
    },
  )
}

// ---------------------------------------------------------------------------
// Service definitions
// ---------------------------------------------------------------------------

/**
 * Pulumi-bound values for the `${VAR}` placeholders a service's compose blocks
 * reference. The registry (`config/services.config.ts`) declares WHICH vars a
 * service consumes; this pool binds the shared, app-wide ones. Service-specific
 * wiring (inter-service URLs, private-network addresses) is declared as
 * `bindings` templates on the registry entry itself and resolved generically
 * below — it never appears here. Unknown placeholders fail fast at deploy time.
 */
const envPool: Record<string, () => pulumi.Input<string>> = {
  FRONTEND_URL: () => appConfig.frontendUrl,
  BACKEND_URL: () => appConfig.backendUrl,
  // Frontend SPA proxy: CSP header + the S3 REST hostname Caddy proxies to.
  FRONTEND_CSP: () => frontendCsp,
  ORIGIN_HOST: () => pulumi.interpolate`${frontendBucketName}.s3.${region}.scw.cloud`,
}

// Vars satisfied outside the pool:
//  - REGISTRY / APP_MODE        — universal, injected into every VM's .env;
//  - INGRESS_PORT / UPSTREAM_*  — per-service ingress wiring, injected below;
//  - *_TAG                      — image tags owned by the reconciler (S3 deploy
//                                 tags), never written to .env by Pulumi.
const INJECTED_VARS = new Set(['REGISTRY', 'APP_MODE', 'INGRESS_PORT', 'UPSTREAM_HOST', 'UPSTREAM_PORT'])
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
// Registry bindings — resolve `@{<slug>.<prop>}` templates from the registry's
// `bindings` field (inter-service wiring declared next to the env vars that
// consume it, SST-Linkable style). Supported properties:
//   @{<slug>.url}        — the service's public URL (from the endpoint registry)
//   @{<slug>.privateIp}  — the service VM's reserved private-network IP
//   @{<slug>.port}       — the service's health/app port
//   @{self.<prop>}       — the consuming service's own values
// ---------------------------------------------------------------------------

const BINDING_RE = /@\{([a-z]+)\.([a-zA-Z]+)\}/g
const endpointBySlug = new Map(endpoints.map((e) => [e.slug, e]))

function bindingPart(selfSlug: ServiceName, target: string, prop: string): pulumi.Input<string> {
  const slug = (target === 'self' ? selfSlug : target) as ServiceName
  const definition = servicesByName.get(slug)
  if (!definition) throw new Error(`compute: binding @{${target}.${prop}} on '${selfSlug}' references unknown service '${slug}'.`)
  switch (prop) {
    case 'privateIp':
      return reservedPrivateIp(slug)
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

/** Resolve a binding template (`ws://@{backend.privateIp}:@{backend.port}/…`) to a Pulumi value. */
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

// Ingress wiring — every VM runs a Caddy `ingress` container that publishes the
// host port and forwards to the app container by its compose-network name. This
// is what lets the reconciler roll the app (`up -d --no-deps <service>`) without
// the LB ever losing its backend. UPSTREAM_HOST is the compose service name;
// INGRESS_PORT/UPSTREAM_PORT are the app's published/internal port (== healthPort).
//
// A blue-green service boots pointing at its initial active slot (`<slug>-blue`);
// the reconciler flips the ingress upstream between slots on each deploy. An
// in-place service is a single container named after the service. Derived from
// the registry's rolloverStrategy — see infra/README.md (Zero-downtime deploys).
const bootSlotService = (name: string): string =>
  servicesByName.get(name as ServiceName)?.rolloverStrategy === 'blue-green' ? `${name}-blue` : name

/** Compose env for one service: universal vars + ingress wiring + binding/pool values for its placeholders. */
function buildComposeEnv(svc: ServiceDefinition): Record<string, () => pulumi.Input<string>> {
  const { slug, healthPort } = svc
  const env: Record<string, () => pulumi.Input<string>> = {
    REGISTRY: () => registryEndpoint,
    APP_MODE: () => mode,
    INGRESS_PORT: () => String(healthPort),
    UPSTREAM_HOST: () => bootSlotService(slug),
    UPSTREAM_PORT: () => String(healthPort),
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
        `compute: service '${slug}' references \${${name}} in its compose blocks but no binding or envPool supplier defines a value for it — add a binding in config/services.config.ts or a supplier in resources/compute.ts.`,
      )
    }
    env[name] = supply
  }
  return env
}

// Concrete VM service list, derived from the canonical registry: only the
// services enabled for this app (feature flags) and placed on their own VM
// (`dedicated-vm`, the default). `placement: 'shared-workers'` is reserved for
// the multi-fork "N worker containers on one shared VM" model and is not yet
// implemented here — guard loudly rather than silently dropping a service.
const services: ServiceConfig[] = enabledServices(appConfig.features).map((svc) => {
  const placement = svc.placement ?? 'dedicated-vm'
  if (placement !== 'dedicated-vm') {
    throw new Error(`compute: placement '${placement}' for service '${svc.slug}' is not yet supported`)
  }
  return { name: svc.slug, profile: svc.slug, port: svc.healthPort, composeEnv: buildComposeEnv(svc) }
})

// ---------------------------------------------------------------------------
// Create VMs
// ---------------------------------------------------------------------------

export interface ComputeInstance {
  name: string
  server: scaleway.instance.Server
  privateIp: pulumi.Output<string>
}

const instances: ComputeInstance[] = []

// Reserved IPAM private IPs, one per service VM — created in a first pass over
// all services (before any VM) so `@{<slug>.privateIp}` bindings resolve at
// plan time with no creation-order constraints between VMs.
const reservedIps = new Map<ServiceName, scaleway.ipam.Ip>()

/** Reserved private IP for a service, CIDR suffix stripped ("10.0.0.9/22" → "10.0.0.9"). */
function reservedPrivateIp(slug: ServiceName): pulumi.Output<string> {
  const ip = reservedIps.get(slug)
  if (!ip) throw new Error(`compute: no reserved private IP for service '${slug}' — is it enabled and compute not deferred?`)
  return ip.address.apply((addr) => addr.split('/')[0])
}

function createVm(service: ServiceConfig): ComputeInstance {
  // Each VM needs a public IP for internet access (package install, image pull)
  const ip = new scaleway.instance.Ip(`ip-${service.name}`, {
    zone,
    tags,
  })

  // Stable private IP reserved in the first pass. Decoupling the IP from the
  // instance lifecycle means it survives VM replacement (deleteBeforeReplace)
  // and is known at plan-time, so LB backends and inter-service bindings can
  // reference it deterministically instead of reading an auto-assigned DHCP
  // address off the server after create.
  const reservedIp = reservedIps.get(service.name as ServiceName)!

  const server = new scaleway.instance.Server(`vm-${service.name}`, {
    name: naming.resource(service.name),
    type: infra.instanceTypeFor(service.name),
    image: 'ubuntu_noble',
    zone,
    tags,
    securityGroupId: securityGroup.id,
    cloudInit: buildCloudInit(service),
    ipIds: [ip.id],
  }, {
    // cloud-init only runs on first boot, so a VM must be replaced to pick up
    // new env/scripts. The image tag lives in S3 (pulled by the on-VM
    // reconciler), not cloud-init, so this replace trigger fires only for
    // genuine cloud-init edits (reconciler script, package install) — not for a
    // routine release.
    replaceOnChanges: ['cloudInit'],
    // Delete old VM before creating new (the pinned public + private IPs can
    // each attach to only one server).
    //
    // TODO(B-full / zero-downtime replacement): switch to create-before-destroy
    // so a replacement VM must serve a healthy /health (X-App-Version == desired
    // SHA) BEFORE the old VM is torn down, instead of the current
    // delete-then-create gap that leaves the LB backend-less if the new VM fails
    // to boot. Blocked on the pinned-IP model: both the public `Ip` and the
    // reserved IPAM private IP (which the LB backend targets deterministically at
    // plan time, see resources/loadbalancer.ts) can each attach to only one
    // server, so a clean create-before-destroy needs per-generation IPs plus an
    // LB-backend re-point — a deliberate redesign tracked for a follow-up session.
    // Downtime during a replacement is currently acceptable; A (Pulumi-managed
    // vm-reader grant) + C (CI preflight + reconciler hard-fail) already remove
    // the *perpetual* downtime failure mode this TODO would further shrink.
    deleteBeforeReplace: true,
    // Attach the Pulumi-managed VM reader IAM grant before the VM boots. On a
    // fresh bootstrap this guarantees the permission sets exist when cloud-init
    // runs its first `runtime-secret-sync`, so the very first boot can hydrate
    // secrets instead of crash-looping until the next deploy.
    dependsOn: [vmReaderPolicy],
  })

  // Attach the VM to the private network with the reserved IPAM IP pinned.
  // The inline `privateNetworks` on the server does not support pinning an
  // IPAM IP, so a dedicated PrivateNic resource is used. It is recreated with
  // the server (depends on serverId) but always reclaims the same reserved IP.
  new scaleway.instance.PrivateNic(`pnic-${service.name}`, {
    serverId: server.id,
    privateNetworkId,
    ipamIpIds: [reservedIp.id],
    zone,
    tags,
  }, {
    deleteBeforeReplace: true,
  })

  // The reserved IP address is stable and known at plan-time. Strip any CIDR
  // suffix the provider may include (e.g. "10.0.0.9/22" → "10.0.0.9").
  const privateIp = reservedIp.address.apply((addr) => addr.split('/')[0])

  const inst = { name: service.name, server, privateIp }
  instances.push(inst)
  return inst
}

if (infra.computeEnabled) {
  // Phase 1 — reserve every VM's stable private IP up front, so inter-service
  // `@{<slug>.privateIp}` bindings resolve regardless of VM creation order.
  for (const service of services) {
    reservedIps.set(
      service.name as ServiceName,
      new scaleway.ipam.Ip(`ipam-${service.name}`, {
        sources: [{ privateNetworkId }],
        isIpv6: false,
        region,
        tags,
      }),
    )
  }

  // Phase 2 — create the VMs (order-independent; bindings read reserved IPs).
  for (const service of services) createVm(service)
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/** All compute instances */
export const computeInstances = instances

/** Get a specific instance's private IP (for LB backend targets) */
export function getInstanceIp(name: string): pulumi.Output<string> {
  const inst = instances.find((i) => i.name === name)
  if (!inst) return pulumi.output('')
  // Stable reserved IPAM IP, decoupled from the VM lifecycle.
  return inst.privateIp
}
