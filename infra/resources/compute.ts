import * as fs from 'node:fs'
import * as path from 'node:path'
import * as pulumi from '@pulumi/pulumi'
import * as scaleway from '@pulumiverse/scaleway'
import { appConfig } from '../../shared'
import { naming, zone, region, tags, infra, vmAccessKey, vmSecretKey } from '../pulumi-context'
import { unionRuntimeSecrets, type RuntimeSecretConsumer } from '../lib/runtime-secrets'
import type { ServiceDefinition } from '../lib/services'
import type { ServiceName } from '../compose/compose'
import { renderCloudInit } from './cloud-init'
import { createComposeEnvBuilder } from './compose-env'
import { activeGenerations, coHosted, enabled, hostSlug, secretConsumersFor, type Generation } from './generations'
import { privateNetworkId } from './network'
import { registryEndpoint } from './registry'
import { secretIds } from './secrets'
import { bootDiagBucketName } from './storage'
import { vmReaderPolicy } from './vm-iam'

// Security Group: fully closed inbound; LB reaches VMs via private network.
// Break-glass access is via Scaleway's serial console (no SSH on the public
// internet). See infra/README.md, "Emergency access".

const securityGroup = new scaleway.instance.SecurityGroup('compute-sg', {
  name: naming.resource('compute-sg'),
  inboundDefaultPolicy: 'drop',
  outboundDefaultPolicy: 'accept',
  inboundRules: [],
  zone,
  tags,
})

/** Build the secret ID and env-name manifest baked into cloud-init. It never contains values. */
function buildRuntimeSecretsManifest(consumers: RuntimeSecretConsumer[]): pulumi.Output<string> {
  const definitions = unionRuntimeSecrets(consumers)
  return pulumi.all(definitions.map((definition) => secretIds[definition.id])).apply((ids) =>
    JSON.stringify(
      definitions.map((definition, index) => ({
        id: definition.id,
        secretName: definition.secretName,
// Strip the region from Pulumi's composite secret ID because the access URL already contains it.
        secretId: (ids[index] ?? '').split('/').pop(),
        envVar: definition.envVar,
        required: definition.required,
      })),
      null,
      2,
    ),
  )
}

// Compose file content (the generated deploy artifact, read at deploy time)

const composeContent = fs.readFileSync(
  path.resolve(import.meta.dirname, '../compose.gen.yml'),
  'utf-8',
)

// Cloud-init template

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
    // VM reader credentials: minimal-privilege key (registry pull + Secret
    // Manager read), never the operator/CI key.
    vmAccessKey,
    vmSecretKey,
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

// Compose env: the `${VAR}` placeholder scan + `@{slug.prop}` binding DSL live
// in resources/compose-env.ts; the per-generation private-IP supplier is the
// only piece compute owns (it depends on VM planning state below).

const buildComposeEnv = createComposeEnvBuilder(currentGenBindingIp, { hostSlug, coHosted })

// Generation planning owns the service set and content-addressed IDs; this
// module provisions the resulting VMs.
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
 * freshly promoted generation's IP. The generation NIC is created once and not
 * moved.
 */
function currentGenBindingIp(slug: ServiceName): pulumi.Output<string> {
  const liveGen = generationsByService.get(slug)?.[0]
  if (!liveGen) throw new Error(`compute: @{${slug}.privateIp} requested but '${slug}' has no active generation.`)
  const ip = genIps.get(genIpKey(slug, liveGen.id))
  if (!ip) throw new Error(`compute: @{${slug}.privateIp} — no reserved IP for ${slug} gen ${liveGen.id}.`)
  // Strip any CIDR suffix the provider may include, for example "10.0.0.9/22" to "10.0.0.9".
  return ip.address.apply((addr) => addr.split('/')[0] ?? addr)
}

// Accept a Scaleway marketplace label or pinned image UUID without a plan-time lookup.
// The boot agent is pulled at startup, so resolved image rotation is ignored.
const computeImageId: pulumi.Input<string> = infra.computeImage

function createGenerationVm(svc: ServiceDefinition, generation: Generation): GenerationInstance {
  const resourceName = `vm-${svc.slug}-${generation.id}`

  // Public IP for internet egress (image pull) + the per-generation private IP
  // reserved in the first pass (the LB targets the set of active generations).
  const ip = new scaleway.instance.Ip(`ip-${svc.slug}-${generation.id}`, { zone, tags })
  const genPrivateIp = genIps.get(genIpKey(svc.slug, generation.id))
  if (!genPrivateIp) throw new Error(`compute: no reserved private IP for ${svc.slug} gen ${generation.id} (pass 1 must run first)`)

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
    // Generation VMs keep their initial cloud-init and image; changes create a content-addressed
    // generation through the rollout path. Ignoring provider image UUID drift prevents destructive
    // in-place replacement outside load-balancer cutover.
    dependsOn: [vmReaderPolicy],
    ignoreChanges: ['cloudInit', 'image'],
  })

  // The generation's own private-network NIC carries exactly one fixed IP.
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

  const privateIp = genPrivateIp.address.apply((addr) => addr.split('/')[0] ?? addr)
  const inst: GenerationInstance = { service: svc.slug, genId: generation.id, sha: generation.sha, name: resourceName, server, privateIp, privateNic }
  instances.push(inst)
  return inst
}

/** Planned generations for a service; throws if planning did not run for it. */
function generationsFor(slug: ServiceName): Generation[] {
  const generations = generationsByService.get(slug)
  if (!generations) throw new Error(`compute: no generation plan for service '${slug}'`)
  return generations
}

if (infra.computeEnabled) {
  for (const svc of enabled) generationsByService.set(svc.slug, activeGenerations(svc))

  // Pass 1: reserve every (service, generation) private IP up front so
  // `@{backend.privateIp}` bindings resolve at plan time with no VM
  // creation-order constraints.
  for (const svc of enabled) {
    for (const generation of generationsFor(svc.slug)) {
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

  // Pass 2: create the VMs. Bindings read reserved IPs, so order does not matter.
  for (const svc of enabled) {
    for (const generation of generationsFor(svc.slug)) createGenerationVm(svc, generation)
  }
}

// Exports

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
 * Private IPs of every active generation of a service: the initial LB backend
 * server list. The live list is then owned by the cutover task (the LB backend
 * declares `ignoreChanges: ['serverIps']`).
 *
 * Under singleVM a co-hosted worker (cdc/yjs/ai) runs in the host backend
 * process, so its LB backend targets the host VM's
 * generation IPs (on the worker's own port, which the host block publishes).
 */
export function serviceGenerationIps(slug: string): pulumi.Output<string>[] {
  const target =
    appConfig.singleVM && hostSlug && coHosted.some((s) => s.slug === slug) ? hostSlug : slug
  return instances.filter((i) => i.service === target).map((i) => i.privateIp)
}
