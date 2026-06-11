/**
 * Compute — one Docker Compose VM per backend service (backend, cdc, yjs, ai).
 *
 * Each VM has a fully-closed inbound security group and is reachable only over the
 * main private network from the load balancer and database. Cloud-init installs
 * Docker, logs into the container registry, writes the shared compose.yml + .env,
 * and starts the service-specific compose profile.
 *
 * Replacement model: any change to image tag or userdata triggers a full VM
 * replacement; LB health checks bridge the cutover. CDC uses deleteBeforeReplace
 * because it is a singleton — two replication slots must not run concurrently.
 *
 * Constraint: Scaleway has no instance-attached IAM identities, so app secrets
 * and the registry-login credential are embedded in cloud-init userdata; anyone
 * with `InstancesReadOnly` on the project can read them. Break-glass access is
 * the Scaleway serial console (no SSH listener is opened).
 *
 * Credentials embedded in cloud-init use the dedicated `<slug>-vm-reader` IAM
 * application (provisioned by tasks/setup-vm-key.ts in the bootstrap Rotate CI
 * flow). That identity has only ContainerRegistryReadOnly + ObjectStorageReadOnly
 * + SecretManagerReadOnly — no write access to any Scaleway resource.
 */
import * as pulumi from '@pulumi/pulumi'
import * as scaleway from '@pulumiverse/scaleway'
import { naming, zone, region, tags, infra, mode, hasDomain, appConfig, vmAccessKey, vmSecretKey } from '../helpers'
import { buildInstallSnippet, buildReconcilerEnv, type ReconcilerService } from '../reconciler/index'
import { runtimeSecretsForConsumer, type RuntimeSecretConsumer } from '../lib/runtime-secrets'
import { enabledServices, type ServiceName } from '../lib/services'
import { frontendCsp } from '../lib/frontend-csp'
import { renderCloudInit } from './cloud-init'
import { deployTagsBucketName } from './deploy-tags'
import { privateNetworkId } from './network'
import { registryEndpoint } from './registry'
import { secretIds } from './secrets'
import { frontendBucketName } from './storage'

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
  /** Extra compose env vars (REGISTRY, URLs, tags) */
  composeEnv: Record<string, pulumi.Input<string>>
}

function buildCloudInit(service: ServiceConfig): pulumi.Output<string> {
  const envLines = pulumi.all(
    Object.entries(service.composeEnv).map(([k, v]) =>
      pulumi.output(v).apply((val) => `${k}=${val}`),
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

const backendUrl = hasDomain ? appConfig.backendUrl : 'http://localhost:4000'
const frontendUrl = appConfig.frontendUrl
const aiUrl = hasDomain ? appConfig.aiUrl : 'http://localhost:4003'

// CDC -> backend is a server-to-server WebSocket on the internal /internal/cdc
// path. The backend rejects sources outside loopback or the VPC /24 (see
// backend/src/lib/cdc-websocket.ts), so we route over the private network
// directly to the backend VM instead of through the public LB.
// Computed lazily after the backend VM is created, below.
let cdcWsUrl: pulumi.Input<string> = 'ws://localhost:4000/internal/cdc'

// Per-service compose env. The canonical registry (lib/services.ts) owns the
// SET of services + their deploy knobs (profile, port, rollover, flags); this
// map owns only the Pulumi-bound wiring (registry endpoint, inter-service URLs)
// that can't live in the pure registry. cdc's API_WS_URL is a getter so it
// reads the backend private IP resolved AFTER the backend VM is created (below).
const composeEnvFor: Record<ServiceName, () => Record<string, pulumi.Input<string>>> = {
  backend: () => ({
    REGISTRY: registryEndpoint,
    APP_MODE: mode,
    FRONTEND_URL: frontendUrl,
    BACKEND_URL: backendUrl,
  }),
  cdc: () => ({
    REGISTRY: registryEndpoint,
    APP_MODE: mode,
    get API_WS_URL() { return cdcWsUrl },
    BACKEND_URL: backendUrl,
  }),
  yjs: () => ({
    REGISTRY: registryEndpoint,
    APP_MODE: mode,
    BACKEND_URL: backendUrl,
  }),
  ai: () => ({
    REGISTRY: registryEndpoint,
    APP_MODE: mode,
    FRONTEND_URL: frontendUrl,
    BACKEND_URL: backendUrl,
    AI_API_URL: aiUrl,
  }),
  // Reverse-proxy in front of the S3 frontend bucket. Adds the frontend's CSP
  // plus transport-level security headers, and rewrites 404s to /index.html so
  // SPA deep links resolve. Deliberately reads no app secret from .env beyond
  // what cloud-init needs to pull the image.
  frontend: () => ({
    REGISTRY: registryEndpoint,
    APP_MODE: mode,
    FRONTEND_CSP: frontendCsp,
    // S3 REST hostname Caddy reverse-proxies to. Bucket name is whatever
    // `naming.frontendBucket` resolves to (e.g. `<slug>-frontend`).
    ORIGIN_HOST: pulumi.interpolate`${frontendBucketName}.s3.${region}.scw.cloud`,
  }),
}

// Ingress wiring — every VM runs a Caddy `ingress` container that publishes the
// host port and forwards to the app container by its compose-network name. This
// is what lets the reconciler roll the app (`up -d --no-deps <service>`) without
// the LB ever losing its backend. UPSTREAM_HOST is the compose service name;
// INGRESS_PORT/UPSTREAM_PORT are the app's published/internal port (== healthPort).
//
// Backend uses blue-green slots (backend-blue / backend-green); its ingress
// starts pointing at the initial active slot (blue), and the reconciler flips
// the upstream between slots on each deploy. Every other service is a single
// container named after the service. See infra/INFRA_ARCHITECTURE.md.
const bootSlotService = (name: string): string => (name === 'backend' ? 'backend-blue' : name)

// Concrete VM service list, derived from the canonical registry: only the
// services enabled for this app (feature flags) and placed on their own VM
// (`dedicated-vm`, the default). `placement: 'shared-workers'` is reserved for
// the multi-fork "N worker containers on one shared VM" model and is not yet
// implemented here — guard loudly rather than silently dropping a service.
const services: ServiceConfig[] = enabledServices(appConfig.has).map((svc) => {
  const placement = svc.placement ?? 'dedicated-vm'
  if (placement !== 'dedicated-vm') {
    throw new Error(`compute: placement '${placement}' for service '${svc.slug}' is not yet supported`)
  }
  const composeEnv = composeEnvFor[svc.slug]()
  composeEnv.INGRESS_PORT = String(svc.healthPort)
  composeEnv.UPSTREAM_HOST = bootSlotService(svc.slug)
  composeEnv.UPSTREAM_PORT = String(svc.healthPort)
  return { name: svc.slug, profile: svc.slug, port: svc.healthPort, composeEnv }
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

function createVm(service: ServiceConfig): ComputeInstance {
  // Each VM needs a public IP for internet access (package install, image pull)
  const ip = new scaleway.instance.Ip(`ip-${service.name}`, {
    zone,
    tags,
  })

  // Reserve a stable private IP from IPAM up front. Decoupling the IP from the
  // instance lifecycle means it survives VM replacement (deleteBeforeReplace)
  // and is known at plan-time, so LB backends can reference it deterministically
  // instead of reading an auto-assigned DHCP address off the server after
  // create (which the provider returns empty at create-time).
  const reservedIp = new scaleway.ipam.Ip(`ipam-${service.name}`, {
    sources: [{ privateNetworkId }],
    isIpv6: false,
    region,
    tags,
  })

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
    // Delete old VM before creating new (IP can only be attached to one server)
    // CDC is additionally a singleton — must not run two at once.
    deleteBeforeReplace: true,
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
  // Create backend first so we can wire CDC's API_WS_URL to its private IP.
  const backendService = services.find((s) => s.name === 'backend')!
  const backend = createVm(backendService)
  cdcWsUrl = backend.privateIp.apply((ip) => `ws://${ip}:4000/internal/cdc`)

  // Create remaining services (cdc reads cdcWsUrl via the getter on composeEnv).
  for (const service of services) {
    if (service.name === 'backend') continue
    createVm(service)
  }
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
