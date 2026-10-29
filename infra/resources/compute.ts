import * as fs from 'node:fs';
import * as path from 'node:path';
import * as pulumi from '@pulumi/pulumi';
import * as scaleway from '@pulumiverse/scaleway';
import { engineConfig } from '../config/engine-config';
import { telemetrySink } from '../config/telemetry.config';

const appConfig = engineConfig();

import { composeConfig, type ServiceName } from '../compose/compose';
import { sizing } from '../config/sizing';
import { type RuntimeSecretConsumer, unionRuntimeSecrets } from '../lib/runtime-secrets';
import type { GenerationKeys } from '../lib/scaleway/machine-keys';
import { BOOT_IMAGE_NAME, imageRepositoryOf, type ResolvedImage, resolveReleaseImage } from '../lib/scaleway/release-image';
import type { ServiceDefinition } from '../lib/services';
import { naming, region, tags, zone, zones } from '../pulumi-context';
import { renderCloudInit } from './cloud-init';
import { createComposeEnvBuilder } from './compose-env';
import { activeGenerations, coHosted, collocated, enabled, type Generation, hostSlug, secretConsumersFor } from './generations';
import { privateNetworkId } from './network';
import { registryEndpoint } from './registry';
import { secretIds } from './secrets';
import { bootDiagBucketName } from './storage';

/**
 * Each running service's standing key, which the deploy read into INFRA_GENERATION_KEYS_FILE (tasks/generation-keys.ts) for every new
 * machine's cloud-init. Absent on an apply or a preview, where a pre-existing generation ignores its cloud-init; a new one is refused.
 */
const generationKeys: GenerationKeys | undefined = process.env.INFRA_GENERATION_KEYS_FILE
  ? JSON.parse(fs.readFileSync(process.env.INFRA_GENERATION_KEYS_FILE, 'utf8'))
  : undefined;

// Fully closed inbound: the LB reaches VMs over the private network, and no machine takes a login; the serial console shows its output.
const closedGroup = (logicalName: string, groupZone: string) =>
  new scaleway.instance.SecurityGroup(logicalName, {
    name: naming.resource('compute-sg'),
    inboundDefaultPolicy: 'drop',
    outboundDefaultPolicy: 'accept',
    inboundRules: [],
    zone: groupZone,
    tags,
  });

const securityGroup = closedGroup('compute-sg', zone);
// A group is zonal, and the builder is made in another zone of the region when its type is out of stock in this one (tasks/build-release.ts).
for (const other of zones.filter((candidate) => candidate !== zone)) closedGroup(`compute-sg-${other}`, other);

/** Build the secret ID and env-name manifest baked into cloud-init. It never contains values. A secret is read from the copy of the first consumer the machine carries. */
function buildRuntimeSecretsManifest(consumers: RuntimeSecretConsumer[]): pulumi.Output<string> {
  const definitions = unionRuntimeSecrets(consumers);
  const consumerOf = (definition: (typeof definitions)[number]) =>
    consumers.find((candidate) => (definition.services as readonly string[]).includes(candidate));
  const copyOf = (definition: (typeof definitions)[number]) => {
    const consumer = consumerOf(definition);
    const id = consumer ? secretIds[definition.id]?.[consumer] : undefined;
    if (!id) throw new Error(`compute: no copy of '${definition.secretName}' for ${consumers.join(', ')}`);
    return id;
  };
  return pulumi.all(definitions.map(copyOf)).apply((ids) =>
    JSON.stringify(
      definitions.map((definition, index) => ({
        id: definition.id,
        secretName: definition.secretName,
        // The copy is read with the key of the service it belongs to.
        service: consumerOf(definition),
        // Strip the region from Pulumi's composite secret id: the access URL already carries it.
        secretId: (ids[index] ?? '').split('/').pop(),
        envVar: definition.envVar,
        required: definition.required,
      })),
      null,
      2,
    ),
  );
}

const composeContent = fs.readFileSync(path.resolve(import.meta.dirname, '../compose.gen.yml'), 'utf-8');

interface ServiceConfig {
  name: string;
  profile: string;
  /** Compose services the boot runner starts on this VM: the service plus, on the singleVM host, every collocated container. Explicit names keep the one-shot release companion out of `compose up`. */
  startServices: string[];
  /** Whether this service runs the one-shot release companion before the app. */
  runRelease: boolean;
  /** Runtime-secret consumers whose secrets this VM's `.env.runtime` manifest carries: the service, plus the folded co-hosted workers on the singleVM host. */
  secretConsumers: RuntimeSecretConsumer[];
  /** Compose env var suppliers (REGISTRY, URLs, the baked image tag), lazy so resource-backed values resolve only when VMs are created. */
  composeEnv: Record<string, () => pulumi.Input<string>>;
  /** The machine's own service key; empty where the update keeps a machine as it booted. */
  key: { accessKey: string; secretKey: string };
  /** The secret key of each other service the singleVM host carries. */
  coHostedSecretKeys: Record<string, string>;
  /** v2 + s3Access: the boot runner exports the service key as S3_* env. */
  exportS3Env?: boolean;
}

// Per image and release memo, so a release resolves each image's digest once, not once per VM. Stores the raw resolution, which may reject;
// callers apply their own pin handling.
const imageResolutions = new Map<string, Promise<ResolvedImage>>();

function resolveImageOnce(registry: string, image: string, releaseSha: string): Promise<ResolvedImage> {
  const memoKey = `${registry}|${image}|${releaseSha}`;
  let pending = imageResolutions.get(memoKey);
  if (!pending) {
    // The run's own key reads the registry: the deploy key in a deploy, the operator key in an apply.
    pending = resolveReleaseImage({ registry, image, releaseSha, secretKey: process.env.SCW_SECRET_KEY ?? '' });
    imageResolutions.set(memoKey, pending);
  }
  return pending;
}

/**
 * Resolve an image of the release (the boot runner's or a service's) to the digest it is pullable by, so a later push under the same tag
 * changes nothing a machine runs. `requirePinned` fails closed on a real `up` for a newly rolling generation; a pre-existing generation and any
 * dry run degrade to the tag with a warning.
 */
function pinnedImageFor(registry: string, image: string, releaseSha: string, requirePinned: boolean): Promise<ResolvedImage | undefined> {
  return resolveImageOnce(registry, image, releaseSha).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    if (pulumi.runtime.isDryRun()) {
      pulumi.log.warn(`${image} digest resolution failed (preview continues on the tag): ${message}`);
      return undefined;
    }
    if (!requirePinned) {
      pulumi.log.warn(`${image} not resolvable for existing generation ${releaseSha}; it keeps running on its booted image: ${message}`);
      return undefined;
    }
    throw new Error(`Refusing to plan a VM with an unpinned ${image} image: ${message}`);
  });
}

/** A service's `*_TAG` for one generation: `<sha>@sha256:<digest>`, which compose pulls by digest; the bare tag where pinning degrades. */
function pinnedImageTag(releaseSha: string, requirePinned: boolean): (slug: string) => pulumi.Output<string> {
  return (slug) => {
    const block = composeConfig.services[slug];
    if (!block) throw new Error(`compute: no compose service '${slug}' to pin an image for`);
    const image = imageRepositoryOf(block.image);
    return registryEndpoint.apply(async (registry) => {
      const resolved = await pinnedImageFor(registry, image, releaseSha, requirePinned);
      return resolved ? `${releaseSha}@${resolved.digest}` : releaseSha;
    });
  };
}

function buildCloudInit(service: ServiceConfig, releaseSha: string, requirePinnedBootImage: boolean): pulumi.Output<string> {
  const envEntries = Object.entries(service.composeEnv).map(([k, supply]) => pulumi.output(supply()).apply((val) => `${k}=${val}`));
  const envLines = pulumi.all(envEntries);

  const bootImage = registryEndpoint.apply((registry) => pinnedImageFor(registry, BOOT_IMAGE_NAME, releaseSha, requirePinnedBootImage));

  // Secret, so the state keeps the keys in it under the passphrase.
  return pulumi.secret(
    pulumi
      .all([envLines, buildRuntimeSecretsManifest(service.secretConsumers), registryEndpoint, bootDiagBucketName, bootImage])
      .apply(([env, manifest, registry, bootDiagBucket, resolvedBootImage]) =>
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
          ...service.key,
          coHostedSecretKeys: service.coHostedSecretKeys,
          region,
          bootDiagBucket,
          exportS3Env: service.exportS3Env,
          // Deploy trace context, exported by deploy-run before the stack update; ignoreChanges on cloudInit keeps existing generations untouched.
          traceparent: process.env.TRACEPARENT,
          // The app's telemetry sink travels via the boot plan: the boot runner carries no vendor endpoint of its own.
          telemetry: { endpoint: telemetrySink.endpoint, keyHeader: telemetrySink.keyHeader, keyEnvVar: telemetrySink.keyEnvVar },
        }),
      ),
  );
}

// The `${VAR}` scan and `@{slug.prop}` binding DSL live in resources/compose-env.ts; compute owns only the per-generation private-IP supplier, which depends on VM planning state below.

const buildComposeEnv = createComposeEnvBuilder(currentGenBindingIp, { hostSlug, coHosted, collocated });

// Generation planning owns the service set and content-addressed ids; this module provisions the resulting VMs.
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

// Reserved IPAM IPs, one per (service, generation), created before any VM so `@{<slug>.privateIp}` bindings resolve at plan time regardless of VM creation order.
const genIps = new Map<string, scaleway.ipam.Ip>();
const generationsByService = new Map<ServiceName, Generation[]>();

function genIpKey(slug: string, genId: string): string {
  return `${slug}-${genId}`;
}

/** Current-generation private-network IP for a `@{<slug>.privateIp}` binding. A release rolls the stable service first, so a consumer redeployed afterwards bakes the freshly promoted generation's IP. */
function currentGenBindingIp(slug: ServiceName): pulumi.Output<string> {
  const liveGen = generationsByService.get(slug)?.[0];
  if (!liveGen) throw new Error(`compute: @{${slug}.privateIp} requested but '${slug}' has no active generation.`);
  const ip = genIps.get(genIpKey(slug, liveGen.id));
  if (!ip) throw new Error(`compute: @{${slug}.privateIp}: no reserved IP for ${slug} gen ${liveGen.id}.`);
  // Strip any CIDR suffix the provider includes, e.g. "10.0.0.9/22" to "10.0.0.9".
  return ip.address.apply((addr) => addr.split('/')[0] ?? addr);
}

// A Scaleway marketplace label or pinned image UUID, with no plan-time lookup: the boot runner is pulled at startup, so image rotation is ignored.
const computeImageId: pulumi.Input<string> = sizing.computeImage;

function createGenerationVm(svc: ServiceDefinition, generation: Generation): GenerationInstance {
  const resourceName = `vm-${svc.slug}-${generation.id}`;

  // Public IP for egress (image pull) plus the per-generation private IP reserved in pass 1.
  const ip = new scaleway.instance.Ip(`ip-${svc.slug}-${generation.id}`, { zone, tags });
  const genPrivateIp = genIps.get(genIpKey(svc.slug, generation.id));
  if (!genPrivateIp) throw new Error(`compute: no reserved private IP for ${svc.slug} gen ${generation.id} (pass 1 must run first)`);

  // A new generation carries the keys the deploy read: an update without them refuses and never writes an empty key. A preview only plans: the
  // deploy's preflight previews before it reads them, and on a stack that never had a machine every generation is new.
  if (!generation.preexisting && !generationKeys) {
    if (!pulumi.runtime.isDryRun()) {
      throw new Error(
        `compute: planning a NEW ${svc.slug} generation without INFRA_GENERATION_KEYS_FILE: deploy via the deploy task (it reads the machine keys first).`,
      );
    }
    pulumi.log.info(`compute: ${svc.slug} generation ${generation.id} is planned without its keys; a deploy reads them before it updates.`);
  }
  // Every service a machine carries reads its own copies with its own key.
  const keyOf = (consumer: string) => {
    const key = generationKeys?.[consumer];
    if (!key && generationKeys && !generation.preexisting) {
      throw new Error(`compute: a NEW ${svc.slug} generation carries ${consumer}, whose key the deploy did not read`);
    }
    return key ?? { accessKey: '', secretKey: '' };
  };
  const [, ...coHostedConsumers] = secretConsumersFor(svc);
  const serviceConfig: ServiceConfig = {
    name: svc.slug,
    profile: svc.slug,
    startServices: [svc.slug, ...(appConfig.singleVM && svc.slug === hostSlug ? collocated.map((s) => s.slug) : [])],
    runRelease: svc.runRelease ?? false,
    secretConsumers: secretConsumersFor(svc),
    // A newly rolling generation pulls every image by digest; a pre-existing one keeps the cloud-init it booted with (ignoreChanges below).
    composeEnv: buildComposeEnv(svc, pinnedImageTag(generation.sha, !generation.preexisting)),
    key: keyOf(svc.slug),
    coHostedSecretKeys: Object.fromEntries(coHostedConsumers.map((consumer) => [consumer, keyOf(consumer).secretKey])),
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
      // A newly rolling generation must have a pinnable boot image; a pre-existing one degrades to its booted image.
      cloudInit: buildCloudInit(serviceConfig, generation.sha, !generation.preexisting),
      ipIds: [ip.id],
    },
    {
      // Generation VMs keep their initial cloud-init and image: changes roll a new content-addressed generation, and ignoring image UUID drift prevents in-place replacement outside LB cutover.
      ignoreChanges: ['cloudInit', 'image'],
      // The provider reads all user data back into both outputs after every create and refresh, the machine's keys included, and marks
      // neither secret: the state keeps them under the passphrase.
      additionalSecretOutputs: ['userData', 'cloudInit'],
    },
  );

  // The generation's own private-network NIC carries exactly one fixed IP.
  const ipamIpIds: pulumi.Input<string>[] = [genPrivateIp.id];
  const privateNic = new scaleway.instance.PrivateNic(
    `pnic-${svc.slug}-${generation.id}`,
    { serverId: server.id, privateNetworkId, ipamIpIds, zone, tags },
    {
      // Scaleway allows only one private NIC per server and private-network pair, so a replacement must delete the old NIC first.
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

  // Pass 1: reserve every (service, generation) private IP so bindings resolve at plan time with no VM creation-order constraints.
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
 * Private IPs of a service's active generations: the initial LB backend server list, after which the cutover task owns it (`ignoreChanges: ['serverIps']`).
 * Under singleVM, co-hosted workers and collocated containers run on the host VM, so their LB backends target the host's generation IPs on the service's own port.
 */
export function serviceGenerationIps(slug: string): pulumi.Output<string>[] {
  const target = appConfig.singleVM && hostSlug && [...coHosted, ...collocated].some((s) => s.slug === slug) ? hostSlug : slug;
  return instances.filter((i) => i.service === target).map((i) => i.privateIp);
}
