/**
 * Compute — one Docker Compose VM per enabled service GENERATION.
 *
 * Immutable-node model: every release provisions a NEW VM generation
 * `vm-<svc>-<gen>` with the image SHA baked into its cloud-init. There is no
 * background deploy agent and no out-of-band tag channel — the generation IS
 * the release. Pulumi creates/destroys generations; tasks/cutover.ts owns the
 * live LB server list and backend internal-IP handoff during deploy.
 *
 * Generation state lives in stack config, written by CI around the cutover:
 *   infra:gen:<svc>        current live generation number (default 1)
 *   infra:sha:<svc>        image SHA baked into the current generation
 *   infra:pendingGen:<svc> next generation, set during a cutover (optional)
 *   infra:pendingSha:<svc> image SHA for the pending generation
 *   infra:stableInternalGen_<svc> generation carrying a service's stable internal IP
 * compute materialises a VM for every generation in {gen} ∪ {pendingGen}, so the
 * "create bookend" stands up the new generation alongside the old, and the
 * "destroy bookend" (after CI bumps `gen` and clears `pendingGen`) tears the old
 * one down.
 *
 * Each VM has a fully-closed inbound security group and is reachable only over the
 * main private network from the load balancer and database. Cloud-init installs
 * Docker, logs into the container registry, writes the shared compose.yml + .env
 * (with the baked image tag), runs the one-shot migrate companion for services
 * that opt in, and starts the service compose profile binding the host port.
 *
 * Constraint: Scaleway has no instance-attached IAM identities, so app secrets
 * and the registry-login credential are embedded in cloud-init userdata; anyone
 * with `InstancesReadOnly` on the project can read them. Break-glass access is
 * the Scaleway serial console (no SSH listener is opened).
 *
 * Credentials embedded in cloud-init use the dedicated `<slug>-vm-reader` IAM
 * application (provisioned by tasks/setup-vm-key.ts in the bootstrap Rotate keys
 * flow). That identity has only ContainerRegistryReadOnly + SecretManagerReadOnly
 * + SecretManagerSecretAccess — no write access to any Scaleway resource.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as pulumi from '@pulumi/pulumi'
import * as scaleway from '@pulumiverse/scaleway'
import { naming, zone, region, tags, infra, infraConfig, mode, appConfig, endpoints, vmAccessKey, vmSecretKey } from '../pulumi-context'
import { runtimeSecretsForConsumer, type RuntimeSecretConsumer } from '../lib/runtime-secrets'
import { composeConfig } from '../compose/compose'
import { enabledServices, servicesByName, type ServiceDefinition, type ServiceName } from '../lib/services'
import { frontendCsp } from '../lib/frontend-csp'
import { renderCloudInit } from './cloud-init'
import { privateNetworkId } from './network'
import { registryEndpoint } from './registry'
import { secretIds } from './secrets'
import { bootDiagBucketName, frontendBucketName } from './storage'
import { vmReaderPolicy } from './vm-iam'

// ---------------------------------------------------------------------------
// VM reader credentials — minimal-privilege key for registry pull and Secret
// Manager access. Never the operator/CI key.
// ---------------------------------------------------------------------------

const scwAccessKey = vmAccessKey
const scwSecretKey = vmSecretKey

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
// Runtime secret manifest — metadata only (secret IDs + env var names, never
// values). Baked directly into the new generation's cloud-init: under immutable
// releases every change replaces the VM anyway, so there is no reason to deliver
// it out-of-band. The on-VM runtime-secret-sync reads it to hydrate
// /opt/app/.env.runtime from Secret Manager before the app boots.
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
        // region in its path, so emit ONLY the bare uuid here — otherwise the
        // VM requests `/secrets/<region>/<uuid>/...` and every read 404s.
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

const composeContent = fs.readFileSync(
  path.resolve(import.meta.dirname, '../compose.gen.yml'),
  'utf-8',
)

// ---------------------------------------------------------------------------
// Cloud-init template
// ---------------------------------------------------------------------------

interface ServiceConfig {
  name: string
  profile: string
  /** App container's internal port; also the host port the app publishes. */
  port: number
  /** Whether this service runs the one-shot migrate companion before the app. */
  runMigrate: boolean
  /**
   * Compose env var suppliers (REGISTRY, URLs, the baked image tag). Lazy so
   * values backed by Pulumi resources (bucket names, the internal backend IP)
   * are only resolved when VMs are actually created.
   */
  composeEnv: Record<string, () => pulumi.Input<string>>
}

function buildCloudInit(service: ServiceConfig, releaseSha: string): pulumi.Output<string> {
  const envLines = pulumi.all(
    Object.entries(service.composeEnv).map(([k, supply]) =>
      pulumi.output(supply()).apply((val) => `${k}=${val}`),
    ),
  )

  return pulumi.all([
    envLines,
    buildRuntimeSecretsManifest(service.name),
    scwAccessKey,
    scwSecretKey,
    registryEndpoint,
    bootDiagBucketName,
  ]).apply(([env, manifest, accessKey, secretKey, registry, bootDiagBucket]) =>
    renderCloudInit({
      service: service.name,
      profile: service.profile,
      runMigrate: service.runMigrate,
      releaseSha,
      envFileContent: env.join('\n'),
      manifestContent: manifest,
      composeContent,
      registry,
      accessKey,
      secretKey,
      region,
      bootDiagBucket,
      dockerPreinstalled: infra.dockerPreinstalled,
    }),
  )
}

// ---------------------------------------------------------------------------
// Service definitions
// ---------------------------------------------------------------------------

/**
 * Pulumi-bound values for the `${VAR}` placeholders a service's compose blocks
 * reference. The registry declares WHICH vars a service consumes; this pool
 * binds the shared, app-wide ones. Service-specific wiring is declared as
 * `bindings` on the registry entry and resolved generically below.
 */
function servicePublicUrl(slug: string): string {
  const services = appConfig.services as Record<string, { publicUrl?: string }>
  const service = services[slug]
  if (!service?.publicUrl) throw new Error(`compute: service '${slug}' has no publicUrl in appConfig.services`)
  return service.publicUrl
}

const envPool: Record<string, () => pulumi.Input<string>> = {
  FRONTEND_URL: () => servicePublicUrl('frontend'),
  BACKEND_URL: () => servicePublicUrl('backend'),
  // Frontend SPA proxy: CSP header + the S3 REST hostname Caddy proxies to.
  FRONTEND_CSP: () => frontendCsp,
  ORIGIN_HOST: () => pulumi.interpolate`${frontendBucketName}.s3.${region}.scw.cloud`,
}

// Vars satisfied outside the pool:
//  - REGISTRY / APP_MODE — universal, injected into every VM's .env;
//  - *_TAG               — the baked image tag (the generation's SHA), injected
//                          per service below.
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
// Registry bindings — resolve `@{<slug>.<prop>}` templates from the registry's
// `bindings` field. Supported properties:
//   @{<slug>.url}        — the service's public URL (from the endpoint registry)
//   @{<slug>.privateIp}  — the service's stable internal address (`stablePrivateIp`)
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
      return stableBindingIp(slug)
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

/** The compose `*_TAG` variable a service's image reference reads (e.g. backend → BACKEND_TAG). */
function tagVar(slug: string): string {
  return `${slug.toUpperCase()}_TAG`
}

/** Compose env for one service: universal vars + the baked image tag + binding/pool values. */
function buildComposeEnv(svc: ServiceDefinition, releaseSha: string): Record<string, () => pulumi.Input<string>> {
  const { slug } = svc
  const env: Record<string, () => pulumi.Input<string>> = {
    REGISTRY: () => registryEndpoint,
    APP_MODE: () => mode,
    // The generation's pinned image tag — the VM pulls exactly this SHA at boot.
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
        `compute: service '${slug}' references \${${name}} in its compose blocks but no binding or envPool supplier defines a value for it — add a binding in config/services.config.ts or a supplier in resources/compute.ts.`,
      )
    }
    env[name] = supply
  }
  return env
}

// Concrete enabled service list, derived from the canonical registry (feature
// flags). Each runs on its own dedicated VM (the multi-fork shared-workers
// placement is not yet implemented here — guard loudly).
const enabled = enabledServices(appConfig.services).map((svc) => {
  const placement = svc.placement ?? 'dedicated-vm'
  if (placement !== 'dedicated-vm') {
    throw new Error(`compute: placement '${placement}' for service '${svc.slug}' is not yet supported`)
  }
  return svc
})

// ---------------------------------------------------------------------------
// Generation state (from stack config, written by CI around a cutover)
// ---------------------------------------------------------------------------

interface Generation {
  gen: number
  sha: string
}

/** Active generations for a service: the live one plus any pending one mid-cutover. */
function activeGenerations(slug: string): Generation[] {
  // Config keys are underscore-flat (`gen_<slug>`), NOT colon-namespaced — a
  // colon in a Pulumi config key collides with the `<namespace>:<key>` syntax
  // (`pulumi config set gen:backend` would set namespace `gen`, not the `infra`
  // key `gen:backend`). Underscores keep `pulumi config set infra:gen_backend`
  // unambiguous.
  const gen = infraConfig.getNumber(`gen_${slug}`) ?? 1
  const sha = infraConfig.get(`sha_${slug}`) ?? 'latest'
  const generations: Generation[] = [{ gen, sha }]

  const pendingGen = infraConfig.getNumber(`pendingGen_${slug}`)
  if (pendingGen !== undefined && pendingGen !== gen) {
    const pendingSha = infraConfig.get(`pendingSha_${slug}`) ?? 'latest'
    generations.push({ gen: pendingGen, sha: pendingSha })
  }
  return generations
}

// ---------------------------------------------------------------------------
// Create VMs
// ---------------------------------------------------------------------------

export interface GenerationInstance {
  /** Logical service slug. */
  service: ServiceName
  /** Generation number. */
  gen: number
  /** Pulumi resource name `vm-<svc>-<gen>`. */
  name: string
  server: scaleway.instance.Server
  /** This generation VM's own private-network IP. */
  privateIp: pulumi.Output<string>
  /** Private NIC carrying this generation's own private-network IP. */
  privateNic: scaleway.instance.PrivateNic
}

const instances: GenerationInstance[] = []

// Reserved private-network IPAM IPs, one per (service, generation), created in a
// first pass before any VM so inter-service `@{<slug>.privateIp}` bindings can
// resolve at plan time regardless of VM creation order. Keyed `<slug>-<gen>`.
const genIps = new Map<string, scaleway.ipam.Ip>()
const generationsByService = new Map<ServiceName, Generation[]>()
const stablePrivateIpServices = enabled.filter((svc) => svc.stablePrivateIp)
if (stablePrivateIpServices.length > 1) {
  throw new Error(`compute: only one stablePrivateIp service is supported today (${stablePrivateIpServices.map((svc) => svc.slug).join(', ')}).`)
}
const stablePrivateIpService = stablePrivateIpServices[0]
const stablePrivateIp = stablePrivateIpService
  ? new scaleway.ipam.Ip(`ipam-${stablePrivateIpService.slug}-internal`, {
      sources: [{ privateNetworkId }],
      isIpv6: false,
      region,
      tags,
    })
  : undefined

function genIpKey(slug: string, gen: number): string {
  return `${slug}-${gen}`
}

/**
 * Stable internal service IP for services that opt into `stablePrivateIp`.
 * The cutover task moves this IP to the new generation after it is healthy and
 * before the LB contracts. Consumers keep one logical address and reconnect
 * through the handoff.
 */
function stableBindingIp(slug: ServiceName): pulumi.Output<string> {
  if (!stablePrivateIp || stablePrivateIpService?.slug !== slug) {
    throw new Error(`compute: @{${slug}.privateIp} requested but '${slug}' does not declare stablePrivateIp: true.`)
  }
  // Strip any CIDR suffix the provider may include ("10.0.0.9/22" → "10.0.0.9").
  return stablePrivateIp.address.apply((addr) => addr.split('/')[0])
}

function createGenerationVm(svc: ServiceDefinition, generation: Generation): GenerationInstance {
  const resourceName = `vm-${svc.slug}-${generation.gen}`

  // Public IP for internet egress (image pull) + the per-generation private IP
  // reserved in the first pass (the LB targets the set of active generations).
  const ip = new scaleway.instance.Ip(`ip-${svc.slug}-${generation.gen}`, { zone, tags })
  const genPrivateIp = genIps.get(genIpKey(svc.slug, generation.gen))!

  const serviceConfig: ServiceConfig = {
    name: svc.slug,
    profile: svc.slug,
    port: svc.healthPort,
    runMigrate: svc.runMigrate ?? false,
    composeEnv: buildComposeEnv(svc, generation.sha),
  }

  const server = new scaleway.instance.Server(resourceName, {
    name: naming.resource(`${svc.slug}-${generation.gen}`),
    type: infra.instanceTypeFor(svc.slug),
    image: infra.computeImage,
    zone,
    tags,
    securityGroupId: securityGroup.id,
    cloudInit: buildCloudInit(serviceConfig, generation.sha),
    ipIds: [ip.id],
  }, {
    // A generation VM is immutable: any cloud-init change is a NEW generation
    // (new resource name), never an in-place replacement. The vm-reader IAM
    // grant must exist before first boot so cloud-init can hydrate secrets.
    dependsOn: [vmReaderPolicy],
  })

  const stableServiceGenerations = stablePrivateIpService ? generationsByService.get(stablePrivateIpService.slug) : undefined
  const stableInternalGen = stablePrivateIpService
    ? infraConfig.getNumber(`stableInternalGen_${stablePrivateIpService.slug}`) ?? stableServiceGenerations?.[0]?.gen
    : undefined
  const ipamIpIds: pulumi.Input<string>[] = [genPrivateIp.id]
  if (stablePrivateIp && svc.slug === stablePrivateIpService?.slug && generation.gen === stableInternalGen) ipamIpIds.push(stablePrivateIp.id)

  // The generation's own private-network NIC. A service that declares
  // stablePrivateIp also carries its stable service IP on the active generation.
  const privateNic = new scaleway.instance.PrivateNic(`pnic-${svc.slug}-${generation.gen}`, {
    serverId: server.id,
    privateNetworkId,
    ipamIpIds,
    zone,
    tags,
  }, {
    // Scaleway allows only one private NIC per server/private-network pair.
    // Moving the stable IP changes ipamIpIds, which the provider replaces.
    deleteBeforeReplace: true,
  })

  const privateIp = genPrivateIp.address.apply((addr) => addr.split('/')[0])
  const inst: GenerationInstance = { service: svc.slug, gen: generation.gen, name: resourceName, server, privateIp, privateNic }
  instances.push(inst)
  return inst
}

if (infra.computeEnabled) {
  for (const svc of enabled) generationsByService.set(svc.slug, activeGenerations(svc.slug))

  // Pass 1 — reserve every (service, generation) private IP up front so
  // `@{backend.privateIp}` bindings resolve at plan time with no VM
  // creation-order constraints.
  for (const svc of enabled) {
    for (const generation of generationsByService.get(svc.slug)!) {
      genIps.set(
        genIpKey(svc.slug, generation.gen),
        new scaleway.ipam.Ip(`ipam-${svc.slug}-${generation.gen}`, {
          sources: [{ privateNetworkId }],
          isIpv6: false,
          region,
          tags,
        }),
      )
    }
  }

  // Pass 2 — create the VMs (order-independent; bindings read reserved IPs).
  for (const svc of enabled) {
    for (const generation of generationsByService.get(svc.slug)!) createGenerationVm(svc, generation)
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/** All generation VM instances (one per active generation per enabled service). */
export const computeInstances = instances

export const stablePrivateIpAddress = stablePrivateIp ? stablePrivateIp.address.apply((addr) => addr.split('/')[0]) : pulumi.output(undefined)
export const stablePrivateIpId = stablePrivateIp ? stablePrivateIp.id : pulumi.output(undefined)
export const stablePrivateIpServiceSlug = pulumi.output(stablePrivateIpService?.slug)

export const computeGenerationMetadata = pulumi.all(instances.map((i) => pulumi.all([i.server.id, i.privateIp, i.privateNic.id]).apply(([serverId, privateIp, privateNicId]) => ({
  service: i.service,
  gen: i.gen,
  name: i.name,
  serverId,
  privateIp,
  privateNicId,
})))).apply((items) => items)

/**
 * Private IPs of every active generation of a service — the initial LB backend
 * server list. The live list is then owned by the cutover task (the LB backend
 * declares `ignoreChanges: ['serverIps']`).
 */
export function serviceGenerationIps(slug: string): pulumi.Output<string>[] {
  return instances.filter((i) => i.service === slug).map((i) => i.privateIp)
}
