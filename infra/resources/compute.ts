import * as fs from 'node:fs';
import * as path from 'node:path';
import * as pulumi from '@pulumi/pulumi';
import * as scaleway from '@pulumiverse/scaleway';
import { engineConfig } from '../config/engine-config';
import { telemetrySink } from '../config/telemetry.config';

const appConfig = engineConfig();

import type { ServiceName } from '../compose/compose';
import { sizing } from '../config/sizing';
import { type RuntimeSecretConsumer, unionRuntimeSecrets } from '../lib/runtime-secrets';
import { type ResolvedBootImage, resolveBootImage } from '../lib/scaleway/boot-image';
import type { ServiceDefinition } from '../lib/services';
import { naming, region, tags, zone } from '../pulumi-context';
import { renderCloudInit } from './cloud-init';
import { createComposeEnvBuilder } from './compose-env';
import {
  activeGenerations,
  coHosted,
  collocated,
  enabled,
  type Generation,
  hostSlug,
  secretConsumersFor,
} from './generations';
import { privateNetworkId } from './network';
import { registryEndpoint } from './registry';
import { secretIds } from './secrets';
import { bootDiagBucketName } from './storage';
import { vmIamPolicies } from './vm-iam';

/**
 * This deploy's minted credentials, written by
 * tasks/mint-generation-keys.ts and passed via INFRA_GENERATION_KEYS_FILE.
 * Absent on non-deploy ups (apply/preview): pre-existing generations carry
 * `ignoreChanges: ['cloudInit']`, so their inputs may compute from an empty
 * placeholder. Planning a NEW generation without minted keys is refused
 * below (createGenerationVm guard).
 */
interface GenerationKeysFile {
  bootAccessKey: string;
  bootSecretKey: string;
  handoffSecretIds: Record<string, string>;
}

function readGenerationKeysFile(): GenerationKeysFile | undefined {
  const file = process.env.INFRA_GENERATION_KEYS_FILE;
  if (!file) return undefined;
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<GenerationKeysFile>;
  if (
    typeof parsed.bootAccessKey !== 'string' ||
    typeof parsed.bootSecretKey !== 'string' ||
    typeof parsed.handoffSecretIds !== 'object'
  ) {
    throw new Error('INFRA_GENERATION_KEYS_FILE is malformed — re-run the deploy (mint-generation-keys writes it).');
  }
  return parsed as GenerationKeysFile;
}

const generationKeys = readGenerationKeysFile();

// The credential pair baked into cloud-init: the boot fetcher key (registry
// pull + handoff read + diag write ONLY, because the real service key arrives
// via the single-access handoff bundle). Empty placeholder on non-deploy ups
// (pre-existing generations ignore cloudInit changes).
const vmAccessKey = generationKeys ? pulumi.secret(generationKeys.bootAccessKey) : pulumi.secret('');
const vmSecretKey = generationKeys ? pulumi.secret(generationKeys.bootSecretKey) : pulumi.secret('');

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
});

/** Build the secret ID and env-name manifest baked into cloud-init. It never contains values. */
function buildRuntimeSecretsManifest(consumers: RuntimeSecretConsumer[]): pulumi.Output<string> {
  const definitions = unionRuntimeSecrets(consumers);
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
  );
}

// Compose file content (the generated deploy artifact, read at deploy time)

const composeContent = fs.readFileSync(path.resolve(import.meta.dirname, '../compose.gen.yml'), 'utf-8');

// Cloud-init template

interface ServiceConfig {
  name: string;
  profile: string;
  /**
   * Compose services the boot runner starts on this VM: the service itself
   * plus, on the singleVM host, every collocated (`placement: 'host'`)
   * container. Explicit names keep the one-shot release companion (which
   * shares the host profile) out of `compose up`.
   */
  startServices: string[];
  /** Whether this service runs the one-shot release companion before the app. */
  runRelease: boolean;
  /**
   * Runtime-secret consumers whose secrets this VM's `.env.runtime` manifest
   * carries. Usually just the service itself; the singleVM host also lists the
   * co-hosted workers folded into its process.
   */
  secretConsumers: RuntimeSecretConsumer[];
  /**
   * Compose env var suppliers (REGISTRY, URLs, the baked image tag). Lazy so
   * values backed by Pulumi resources (bucket names, the internal backend IP)
   * are only resolved when VMs are actually created.
   */
  composeEnv: Record<string, () => pulumi.Input<string>>;
  /** v2: single-access handoff secret id holding this service's minted key. */
  handoffSecretId?: string;
  /** v2 + s3Access: the boot runner exports the service key as S3_* env. */
  exportS3Env?: boolean;
}

// Per-tag boot-image memo: every generation of a release resolves the boot image
// name+digest once, not once per VM. Stores the raw resolution (which may reject);
// each caller applies its own dry-run / pin-requirement handling below.
const bootImageResolutions = new Map<string, Promise<ResolvedBootImage>>();

function resolveBootImageOnce(registry: string, releaseSha: string, secretKey: string): Promise<ResolvedBootImage> {
  const memoKey = `${registry}|${releaseSha}`;
  let pending = bootImageResolutions.get(memoKey);
  if (!pending) {
    pending = resolveBootImage({ registry, releaseSha, secretKey });
    bootImageResolutions.set(memoKey, pending);
  }
  return pending;
}

/**
 * Resolve the boot runner tag to the name+digest it is pullable by, so the
 * launcher pins the root-equivalent (socket-mounted) image against later registry
 * pushes.
 *
 * `requirePinned` fails closed on a real `up` for a newly rolling generation whose
 * boot image must exist. A pre-existing generation degrades to an unpinned tag
 * with a warning: its VM already booted and carries `ignoreChanges` on cloud-init,
 * so a boot image no longer resolvable in the registry must not block the deploy.
 * A dry run always degrades so previews never require registry availability.
 */
function bootImageFor(
  registry: string,
  releaseSha: string,
  secretKey: string,
  requirePinned: boolean,
): Promise<ResolvedBootImage | undefined> {
  return resolveBootImageOnce(registry, releaseSha, secretKey).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    if (pulumi.runtime.isDryRun()) {
      pulumi.log.warn(`boot image digest resolution failed (preview continues on the tag): ${message}`);
      return undefined;
    }
    if (!requirePinned) {
      pulumi.log.warn(
        `boot image not resolvable for existing generation ${releaseSha}; it keeps running on its booted image: ${message}`,
      );
      return undefined;
    }
    throw new Error(`Refusing to plan a VM with an unpinned boot image: ${message}`);
  });
}

function buildCloudInit(
  service: ServiceConfig,
  releaseSha: string,
  requirePinnedBootImage: boolean,
): pulumi.Output<string> {
  const envLines = pulumi.all(
    Object.entries(service.composeEnv).map(([k, supply]) => pulumi.output(supply()).apply((val) => `${k}=${val}`)),
  );

  const bootImage = pulumi
    .all([registryEndpoint, vmSecretKey])
    .apply(([registry, secretKey]) => bootImageFor(registry, releaseSha, secretKey, requirePinnedBootImage));

  return pulumi
    .all([
      envLines,
      buildRuntimeSecretsManifest(service.secretConsumers),
      // Boot fetcher credentials: minimal-privilege key (registry pull +
      // handoff read + diag write), never the operator/CI key.
      vmAccessKey,
      vmSecretKey,
      registryEndpoint,
      bootDiagBucketName,
      bootImage,
    ])
    .apply(([env, manifest, accessKey, secretKey, registry, bootDiagBucket, resolvedBootImage]) =>
      renderCloudInit({
        slug: naming.slug,
        service: service.name,
        profile: service.profile,
        startServices: service.startServices,
        runRelease: service.runRelease,
        releaseSha,
        envFileContent: env.join('\n'),
        manifestContent: manifest,
        composeContent,
        registry,
        bootImageName: resolvedBootImage?.image,
        bootImageDigest: resolvedBootImage?.digest,
        accessKey,
        secretKey,
        region,
        bootDiagBucket,
        handoffSecretId: service.handoffSecretId,
        exportS3Env: service.exportS3Env,
        // Deploy trace context (deploy-run exports it before the stack update);
        // ignoreChanges on cloudInit keeps existing generations untouched.
        traceparent: process.env.TRACEPARENT,
        // The app's telemetry sink travels via the boot plan; the boot runner
        // carries no vendor endpoint of its own (S20/P-F3).
        telemetry: {
          endpoint: telemetrySink.endpoint,
          keyHeader: telemetrySink.keyHeader,
          keyEnvVar: telemetrySink.keyEnvVar,
        },
      }),
    );
}

// Compose env: the `${VAR}` placeholder scan + `@{slug.prop}` binding DSL live
// in resources/compose-env.ts; the per-generation private-IP supplier is the
// only piece compute owns (it depends on VM planning state below).

const buildComposeEnv = createComposeEnvBuilder(currentGenBindingIp, { hostSlug, coHosted, collocated });

// Generation planning owns the service set and content-addressed IDs; this
// module provisions the resulting VMs.
export interface GenerationInstance {
  /** Logical service slug. */
  service: ServiceName;
  /** Content-addressed generation id. */
  genId: string;
  /** Image SHA baked into this generation. */
  sha: string;
  /** Pulumi resource name `vm-<svc>-<genId>`. */
  name: string;
  server: scaleway.instance.Server;
  /** This generation VM's own private-network IP. */
  privateIp: pulumi.Output<string>;
  /** Private NIC carrying this generation's own private-network IP. */
  privateNic: scaleway.instance.PrivateNic;
}

const instances: GenerationInstance[] = [];

// Reserved private-network IPAM IPs, one per (service, generation), created in a
// first pass before any VM so inter-service `@{<slug>.privateIp}` bindings can
// resolve at plan time regardless of VM creation order. Keyed `<slug>-<genId>`.
const genIps = new Map<string, scaleway.ipam.Ip>();
const generationsByService = new Map<ServiceName, Generation[]>();

function genIpKey(slug: string, genId: string): string {
  return `${slug}-${genId}`;
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
  const liveGen = generationsByService.get(slug)?.[0];
  if (!liveGen) throw new Error(`compute: @{${slug}.privateIp} requested but '${slug}' has no active generation.`);
  const ip = genIps.get(genIpKey(slug, liveGen.id));
  if (!ip) throw new Error(`compute: @{${slug}.privateIp} — no reserved IP for ${slug} gen ${liveGen.id}.`);
  // Strip any CIDR suffix the provider may include, for example "10.0.0.9/22" to "10.0.0.9".
  return ip.address.apply((addr) => addr.split('/')[0] ?? addr);
}

// Accept a Scaleway marketplace label or pinned image UUID without a plan-time lookup.
// The boot runner is pulled at startup, so resolved image rotation is ignored.
const computeImageId: pulumi.Input<string> = sizing.computeImage;

function createGenerationVm(svc: ServiceDefinition, generation: Generation): GenerationInstance {
  const resourceName = `vm-${svc.slug}-${generation.id}`;

  // Public IP for internet egress (image pull) + the per-generation private IP
  // reserved in the first pass (the LB targets the set of active generations).
  const ip = new scaleway.instance.Ip(`ip-${svc.slug}-${generation.id}`, { zone, tags });
  const genPrivateIp = genIps.get(genIpKey(svc.slug, generation.id));
  if (!genPrivateIp)
    throw new Error(`compute: no reserved private IP for ${svc.slug} gen ${generation.id} (pass 1 must run first)`);

  // A NEW generation must carry its minted handoff reference; planning one
  // without the keys file means the mint step did not run, so refuse it and
  // do not bake an empty credential. Pre-existing generations compute placeholder
  // inputs safely (their cloudInit is ignored).
  if (!generation.preexisting && !generationKeys) {
    throw new Error(
      `compute: planning a NEW ${svc.slug} generation without INFRA_GENERATION_KEYS_FILE — deploy via the deploy task (it runs mint-generation-keys first).`,
    );
  }
  const serviceConfig: ServiceConfig = {
    name: svc.slug,
    profile: svc.slug,
    startServices: [svc.slug, ...(appConfig.singleVM && svc.slug === hostSlug ? collocated.map((s) => s.slug) : [])],
    runRelease: svc.runRelease ?? false,
    secretConsumers: secretConsumersFor(svc),
    composeEnv: buildComposeEnv(svc, generation.sha),
    handoffSecretId: generationKeys?.handoffSecretIds[svc.slug],
    exportS3Env: svc.s3Access === true,
  };

  const server = new scaleway.instance.Server(
    resourceName,
    {
      name: naming.resource(`${svc.slug}-${generation.id}`),
      type: sizing.instanceTypeFor(svc.slug),
      image: computeImageId,
      zone,
      tags,
      securityGroupId: securityGroup.id,
      // A newly rolling generation must have a pinnable boot image; a pre-existing
      // generation (its VM already booted, cloud-init ignored) degrades gracefully.
      cloudInit: buildCloudInit(serviceConfig, generation.sha, !generation.preexisting),
      ipIds: [ip.id],
    },
    {
      // Generation VMs keep their initial cloud-init and image; changes create a content-addressed
      // generation through the rollout path. Ignoring provider image UUID drift prevents destructive
      // in-place replacement outside load-balancer cutover. The IAM grants must
      // exist before the VM's first runtime-secret hydration.
      dependsOn: [...vmIamPolicies],
      ignoreChanges: ['cloudInit', 'image'],
    },
  );

  // The generation's own private-network NIC carries exactly one fixed IP.
  const ipamIpIds: pulumi.Input<string>[] = [genPrivateIp.id];
  const privateNic = new scaleway.instance.PrivateNic(
    `pnic-${svc.slug}-${generation.id}`,
    {
      serverId: server.id,
      privateNetworkId,
      ipamIpIds,
      zone,
      tags,
    },
    {
      // Scaleway allows only one private NIC per server/private-network pair, so a
      // one-time transition that does replace a NIC must delete the old one first.
      deleteBeforeReplace: true,
    },
  );

  const privateIp = genPrivateIp.address.apply((addr) => addr.split('/')[0] ?? addr);
  const inst: GenerationInstance = {
    service: svc.slug,
    genId: generation.id,
    sha: generation.sha,
    name: resourceName,
    server,
    privateIp,
    privateNic,
  };
  instances.push(inst);
  return inst;
}

/** Planned generations for a service; throws if planning did not run for it. */
function generationsFor(slug: ServiceName): Generation[] {
  const generations = generationsByService.get(slug);
  if (!generations) throw new Error(`compute: no generation plan for service '${slug}'`);
  return generations;
}

if (sizing.computeEnabled) {
  for (const svc of enabled) generationsByService.set(svc.slug, activeGenerations(svc));

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
      );
    }
  }

  // Pass 2: create the VMs. Bindings read reserved IPs, so order does not matter.
  for (const svc of enabled) {
    for (const generation of generationsFor(svc.slug)) createGenerationVm(svc, generation);
  }
}

// Exports

/** All generation VM instances (one per active generation per enabled service). */
export const computeInstances = instances;

export const computeGenerationMetadata = pulumi.all(
  instances.map((i) =>
    pulumi.all([i.server.id, i.privateIp, i.privateNic.id]).apply(([serverId, privateIp, privateNicId]) => ({
      service: i.service,
      genId: i.genId,
      sha: i.sha,
      name: i.name,
      serverId,
      privateIp,
      privateNicId,
    })),
  ),
);

/**
 * Private IPs of every active generation of a service: the initial LB backend
 * server list. The live list is then owned by the cutover task (the LB backend
 * declares `ignoreChanges: ['serverIps']`).
 *
 * Under singleVM a co-hosted worker (cdc/yjs/mcp) runs in the host backend
 * process and a collocated container (placement 'host') runs on the host VM,
 * so their LB backends target the host VM's generation IPs (on the service's
 * own port: the host block publishes folded worker ports, a collocated
 * container binds its own).
 */
export function serviceGenerationIps(slug: string): pulumi.Output<string>[] {
  const target =
    appConfig.singleVM && hostSlug && [...coHosted, ...collocated].some((s) => s.slug === slug) ? hostSlug : slug;
  return instances.filter((i) => i.service === target).map((i) => i.privateIp);
}
