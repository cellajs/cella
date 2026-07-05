/**
 * Compute — one Docker Compose VM per enabled service GENERATION.
 *
 * Immutable-node model: every release provisions a NEW VM generation
 * `vm-<svc>-<genId>` with the image SHA baked into its cloud-init. There is no
 * background deploy agent and no out-of-band tag channel — the generation IS
 * the release. Pulumi creates/destroys generations; tasks/cutover.ts owns the
 * live LB server list and backend internal-IP handoff during deploy.
 *
 * The `genId` is CONTENT-ADDRESSED (lib/gen-id.ts): a short hash of the release
 * SHA plus a fingerprint of the generation's static, plan-time config. This
 * program is the genId authority — it derives the id for a pending SHA and
 * surfaces it in `computeGenerationMetadata` for the orchestrator to promote.
 *
 * Generation state lives in the S3 control object (resources/control.ts), an
 * append-only-ish ledger written by the orchestrator around a cutover:
 *   active     — the generation currently serving live on the LB
 *   pendingSha — the SHA being rolled in (the genId is derived here, not stored)
 * compute materialises a VM for {active} ∪ {pending}, deduplicated by id, so a
 * same-config redeploy collapses to a single VM. The old generation is reaped as
 * soon as the new one is healthy (no retained `previous`); rollback is a revert
 * commit + redeploy, which recreates every service — including cdc, which is
 * never retained — from its content-addressed id.
 *
 * Each VM has a fully-closed inbound security group and is reachable only over the
 * main private network from the load balancer and database. The baked TypeScript
 * boot agent logs into the container registry, writes the shared compose.yml + .env
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
import { appConfig } from '../../shared'
import { naming, zone, region, tags, infra, mode, endpoints, vmAccessKey, vmSecretKey } from '../pulumi-context'
import { runtimeSecretsForConsumer, type RuntimeSecretConsumer } from '../lib/runtime-secrets'
import { composeConfig } from '../compose/compose'
import { deployedServices, coHostedServices, servicesByName, type ServiceDefinition } from '../lib/services'
import type { ServiceName } from '../compose/compose'
import { deriveGenId } from '../lib/gen-id'
import { frontendCsp } from '../lib/frontend-csp'
import { renderCloudInit } from './cloud-init'
import { privateNetworkId } from './network'
import { controlState } from './control'
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
// it out-of-band. The on-VM boot agent reads it to hydrate /opt/app/.env.runtime
// from Secret Manager before the app boots.
// ---------------------------------------------------------------------------

function buildRuntimeSecretsManifest(consumers: RuntimeSecretConsumer[]): pulumi.Output<string> {
  // Union the definitions across consumers (singleVM host carries its workers'
  // secrets too), deduplicated by id and kept in registry order.
  const seen = new Set<string>()
  const definitions = consumers.flatMap((consumer) => runtimeSecretsForConsumer(consumer)).filter((definition) => {
    if (seen.has(definition.id)) return false
    seen.add(definition.id)
    return true
  })
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
  /** Whether this service runs the one-shot migrate companion before the app. */
  runMigrate: boolean
  /**
   * Runtime-secret consumers whose secrets this VM's `.env.runtime` manifest
   * carries. Usually just the service itself; the singleVM host also lists the
   * co-hosted workers folded into its process.
   */
  secretConsumers: RuntimeSecretConsumer[]
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
    buildRuntimeSecretsManifest(service.secretConsumers),
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
//   @{<slug>.privateIp}  — the service's CURRENT-generation private-network IP
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

// Services that get their own dedicated VM. Under `appConfig.singleVM` the
// enabled `coHosted` workers (cdc/yjs/ai) are folded into the backend process
// and do NOT get their own VM (see `deployedServices`); the load balancer still
// routes to them via the host VM (see `serviceGenerationIps`). Each remaining
// service runs on its own dedicated VM (the multi-fork shared-workers placement
// is not yet implemented here — guard loudly).
const enabled = deployedServices(appConfig.services, appConfig.singleVM).map((svc) => {
  const placement = svc.placement ?? 'dedicated-vm'
  if (placement !== 'dedicated-vm') {
    throw new Error(`compute: placement '${placement}' for service '${svc.slug}' is not yet supported`)
  }
  return svc
})

// Workers folded into the host (backend) process under singleVM — empty in the
// normal split-VM deploy. Their runtime secrets are unioned onto the host VM and
// an `exclusive` one among them forces the host to cut over exclusively.
const coHosted = coHostedServices(appConfig.services, appConfig.singleVM)
const hostSlug = enabled.find((s) => s.primaryRollout)?.slug

/** Runtime-secret consumers whose secrets a service's VM must carry. In singleVM
 *  the host VM additionally carries every co-hosted worker's secrets (the folded
 *  workers read them from the same process). */
function secretConsumersFor(svc: ServiceDefinition): RuntimeSecretConsumer[] {
  if (appConfig.singleVM && svc.slug === hostSlug) {
    return [svc.slug, ...coHosted.map((s) => s.slug)] as RuntimeSecretConsumer[]
  }
  return [svc.slug as RuntimeSecretConsumer]
}

/** The replacement strategy a service's VM actually uses. Under singleVM a host
 *  co-hosting an `exclusive` worker (cdc holds the single replication slot) must
 *  itself cut over exclusively — two overlapping host generations would double-
 *  consume the slot. */
function effectiveStrategy(svc: ServiceDefinition): ServiceDefinition['replacementStrategy'] {
  if (appConfig.singleVM && svc.slug === hostSlug && coHosted.some((s) => s.replacementStrategy === 'exclusive')) {
    return 'exclusive'
  }
  return svc.replacementStrategy
}

// ---------------------------------------------------------------------------
// Generation state (from the S3 control object, written by the orchestrator
// around a cutover). This program is the genId AUTHORITY: it derives the
// content-addressed id for a pending SHA from the service's static, plan-time
// config, materialises the VM as `vm-<svc>-<genId>`, and surfaces the id back
// in `computeGenerationMetadata` for the orchestrator to promote into the ledger.
// ---------------------------------------------------------------------------

interface Generation {
  /** Content-addressed generation id (resource suffix). */
  id: string
  /** Image SHA baked into this generation. */
  sha: string
}

/**
 * Static, synchronously-known configuration that DEFINES a generation. Hashed
 * into the genId so any change here (image reference, consumed env var names,
 * inter-service bindings, runtime-secret manifest metadata, base image, port)
 * rolls a genuinely new generation. Deliberately excludes the rendered
 * cloud-init (a Pulumi Output, unavailable at plan time) and secret VALUES.
 */
function serviceFingerprint(svc: ServiceDefinition): unknown {
  const blocks = Object.values(composeConfig.services)
    .filter((block) => block.profiles.includes(svc.slug))
    .map((block) => ({ image: block.image, ports: block.ports ?? [], environment: block.environment ?? {} }))
  // Union across secret consumers so the singleVM host's genId also captures the
  // co-hosted workers' secret manifest (any change rolls a new generation).
  const seenSecrets = new Set<string>()
  const secrets = secretConsumersFor(svc)
    .flatMap((consumer) => runtimeSecretsForConsumer(consumer))
    .filter((definition) => (seenSecrets.has(definition.id) ? false : (seenSecrets.add(definition.id), true)))
    .map((definition) => ({
      secretName: definition.secretName,
      envVar: definition.envVar,
      required: definition.required,
    }))
  return {
    slug: svc.slug,
    port: svc.healthPort,
    runMigrate: svc.runMigrate ?? false,
    // Only fold in the strategy when singleVM changes it (host co-hosting an
    // exclusive worker) — keeps the split-VM fingerprint byte-stable so this
    // feature doesn't churn every existing service's genId.
    ...(effectiveStrategy(svc) !== svc.replacementStrategy ? { singleVmStrategy: effectiveStrategy(svc) } : {}),
    bindings: svc.bindings ?? {},
    blocks,
    secrets,
    computeImage: typeof infra.computeImage === 'string' ? infra.computeImage : 'dynamic',
  }
}

/**
 * Generations a service materialises: the live one (`active`, else the pending
 * intent on first deploy) and the pending generation being rolled in.
 * Deduplicated by id — when a pending SHA hashes to the active id (a same-config
 * redeploy) it collapses to a single VM. Index 0 is the live binding target.
 * The old generation is reaped once the new one is healthy, so no powered-off
 * rollback VM lingers; rollback is a revert commit + redeploy.
 */
function activeGenerations(svc: ServiceDefinition): Generation[] {
  const entry = controlState.rollout[svc.slug]
  const fingerprint = serviceFingerprint(svc)
  const pending: Generation | undefined = entry?.pendingSha ? { id: deriveGenId(entry.pendingSha, fingerprint), sha: entry.pendingSha } : undefined
  const active: Generation | undefined = entry?.active ? { id: entry.active.id, sha: entry.active.sha } : undefined

  const generations: Generation[] = []
  const seen = new Set<string>()
  const add = (g?: Generation) => {
    if (g && !seen.has(g.id)) {
      seen.add(g.id)
      generations.push(g)
    }
  }

  // Exclusive services (cdc) hold a single resource the platform permits one
  // consumer of (the replication slot), so there is no overlap: materialise
  // ONLY the live generation (the pending intent, else active), which replaces
  // the old VM in place. Under singleVM the host inherits this when it co-hosts
  // an exclusive worker (it now holds the slot in-process).
  if (effectiveStrategy(svc) === 'exclusive') {
    add(pending ?? active)
    if (generations.length === 0) add({ id: deriveGenId('latest', fingerprint), sha: 'latest' })
    return generations
  }

  // Live binding target first: the active generation, or the pending one on a
  // first deploy that has no active yet.
  add(active ?? pending)
  add(pending)

  if (generations.length === 0) {
    // First provision, before any deploy seeds the ledger: a single default gen.
    const sha = 'latest'
    add({ id: deriveGenId(sha, fingerprint), sha })
  }
  return generations
}

// ---------------------------------------------------------------------------
// Create VMs
// ---------------------------------------------------------------------------

export interface GenerationInstance {
  /** Logical service slug. */
  service: ServiceName
  /** Content-addressed generation id. */
  genId: string
  /** Image SHA baked into this generation. */
  sha: string
  /** Pulumi resource name `vm-<svc>-<genId>`. */
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
// resolve at plan time regardless of VM creation order. Keyed `<slug>-<genId>`.
const genIps = new Map<string, scaleway.ipam.Ip>()
const generationsByService = new Map<ServiceName, Generation[]>()

function genIpKey(slug: string, genId: string): string {
  return `${slug}-${genId}`
}

/**
 * Current-generation private-network IP for a binding target (`@{<slug>.privateIp}`).
 * cdc binds to `@{backend.privateIp}` to reach the live backend directly over the
 * private network. Because every release rolls all services together with the
 * stable service (backend) FIRST, a consumer redeployed afterwards bakes the
 * freshly promoted generation's IP — no moving IP and no NIC mutation, so the
 * generation NIC is created once and never replaced.
 */
function currentGenBindingIp(slug: ServiceName): pulumi.Output<string> {
  const liveGen = generationsByService.get(slug)?.[0]
  if (!liveGen) throw new Error(`compute: @{${slug}.privateIp} requested but '${slug}' has no active generation.`)
  const ip = genIps.get(genIpKey(slug, liveGen.id))
  if (!ip) throw new Error(`compute: @{${slug}.privateIp} — no reserved IP for ${slug} gen ${liveGen.id}.`)
  // Strip any CIDR suffix the provider may include ("10.0.0.9/22" → "10.0.0.9").
  return ip.address.apply((addr) => addr.split('/')[0])
}

// Compute base image. `compute.image` is a Scaleway marketplace LABEL ('docker'
// — Docker + compose preinstalled and current) or a literal image UUID to pin a
// specific image. The provider's instance `image` accepts either directly, so
// there is no plan-time getImage lookup: the boot agent ships as a registry
// container pulled at first boot (no baked golden image). `ignoreChanges:['image']`
// keeps a label that resolves to a rotated UUID from churning live generations.
const computeImageId: pulumi.Input<string> = infra.computeImage

function createGenerationVm(svc: ServiceDefinition, generation: Generation): GenerationInstance {
  const resourceName = `vm-${svc.slug}-${generation.id}`

  // Public IP for internet egress (image pull) + the per-generation private IP
  // reserved in the first pass (the LB targets the set of active generations).
  const ip = new scaleway.instance.Ip(`ip-${svc.slug}-${generation.id}`, { zone, tags })
  const genPrivateIp = genIps.get(genIpKey(svc.slug, generation.id))!

  const serviceConfig: ServiceConfig = {
    name: svc.slug,
    profile: svc.slug,
    runMigrate: svc.runMigrate ?? false,
    secretConsumers: secretConsumersFor(svc),
    composeEnv: buildComposeEnv(svc, generation.sha),
  }

  const server = new scaleway.instance.Server(resourceName, {
    name: naming.resource(`${svc.slug}-${generation.id}`),
    type: infra.instanceTypeFor(svc.slug),
    image: computeImageId,
    zone,
    tags,
    securityGroupId: securityGroup.id,
    cloudInit: buildCloudInit(serviceConfig, generation.sha),
    ipIds: [ip.id],
  }, {
    // A generation VM is immutable: cloud-init AND the baked image are part of
    // the generation's identity, fixed at creation. A new cloud-init or a
    // re-baked compute image is a NEW generation (new resource name), never an
    // in-place replacement of a live VM. Without ignoring `image`, re-baking the
    // golden image (which rotates the UUID behind the stable name resolved by
    // getImage latest:true) makes the base `pulumi up` diff every running
    // generation on `image` and destructively replace them (delete-before-create
    // — the LB-overlap cutover is bypassed), taking the live frontend/backend/cdc
    // VMs down at once. The vm-reader IAM grant must exist before first boot so
    // cloud-init can hydrate secrets.
    dependsOn: [vmReaderPolicy],
    ignoreChanges: ['cloudInit', 'image'],
  })

  // The generation's own private-network NIC carries exactly one fixed IP, so
  // it is created once and never mutated — no stable-IP move, no replacement.
  const ipamIpIds: pulumi.Input<string>[] = [genPrivateIp.id]
  const privateNic = new scaleway.instance.PrivateNic(`pnic-${svc.slug}-${generation.id}`, {
    serverId: server.id,
    privateNetworkId,
    ipamIpIds,
    zone,
    tags,
  }, {
    // Scaleway allows only one private NIC per server/private-network pair, so a
    // one-time transition that does replace a NIC must delete the old one first.
    deleteBeforeReplace: true,
  })

  const privateIp = genPrivateIp.address.apply((addr) => addr.split('/')[0])
  const inst: GenerationInstance = { service: svc.slug, genId: generation.id, sha: generation.sha, name: resourceName, server, privateIp, privateNic }
  instances.push(inst)
  return inst
}

if (infra.computeEnabled) {
  for (const svc of enabled) generationsByService.set(svc.slug, activeGenerations(svc))

  // Pass 1 — reserve every (service, generation) private IP up front so
  // `@{backend.privateIp}` bindings resolve at plan time with no VM
  // creation-order constraints.
  for (const svc of enabled) {
    for (const generation of generationsByService.get(svc.slug)!) {
      genIps.set(
        genIpKey(svc.slug, generation.id),
        new scaleway.ipam.Ip(`ipam-${svc.slug}-${generation.id}`, {
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

export const computeGenerationMetadata = pulumi.all(instances.map((i) => pulumi.all([i.server.id, i.privateIp, i.privateNic.id]).apply(([serverId, privateIp, privateNicId]) => ({
  service: i.service,
  genId: i.genId,
  sha: i.sha,
  name: i.name,
  serverId,
  privateIp,
  privateNicId,
}))))

/**
 * Private IPs of every active generation of a service — the initial LB backend
 * server list. The live list is then owned by the cutover task (the LB backend
 * declares `ignoreChanges: ['serverIps']`).
 *
 * Under singleVM a co-hosted worker (cdc/yjs/ai) has no VM of its own — it runs
 * in the host (backend) process — so its LB backend targets the HOST VM's
 * generation IPs (on the worker's own port, which the host block publishes).
 */
export function serviceGenerationIps(slug: string): pulumi.Output<string>[] {
  const target =
    appConfig.singleVM && hostSlug && coHosted.some((s) => s.slug === slug) ? hostSlug : slug
  return instances.filter((i) => i.service === target).map((i) => i.privateIp)
}
