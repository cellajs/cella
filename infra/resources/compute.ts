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

/** This deploy's minted credentials, from tasks/mint-generation-keys.ts via INFRA_GENERATION_KEYS_FILE. Absent on apply/preview ups, where pre-existing generations ignore cloudInit changes; planning a new generation without it is refused. */
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
    throw new Error('INFRA_GENERATION_KEYS_FILE is malformed: re-run the deploy (mint-generation-keys writes it).');
  }
  return parsed as GenerationKeysFile;
}

const generationKeys = readGenerationKeysFile();

// Baked into cloud-init: the boot fetcher key only (registry pull, handoff read, diag write); the real service key arrives via the single-access handoff bundle. Empty placeholder on non-deploy ups.
const vmAccessKey = generationKeys ? pulumi.secret(generationKeys.bootAccessKey) : pulumi.secret('');
const vmSecretKey = generationKeys ? pulumi.secret(generationKeys.bootSecretKey) : pulumi.secret('');

// Fully closed inbound: the LB reaches VMs over the private network and break-glass access is Scaleway's serial console, never SSH on the public internet.

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
  /** v2: single-access handoff secret id holding this service's minted key. */
  handoffSecretId?: string;
  /** v2 + s3Access: the boot runner exports the service key as S3_* env. */
  exportS3Env?: boolean;
}

// Per-tag boot-image memo so a release resolves the boot image name and digest once, not once per VM. Stores the raw resolution, which may reject; callers apply their own pin handling.
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
 * Resolve the boot runner tag to the name and digest it is pullable by, pinning the socket-mounted image against later registry pushes.
 * `requirePinned` fails closed on a real `up` for a newly rolling generation; a pre-existing generation and any dry run degrade to the unpinned tag with a warning.
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
      // Boot fetcher credentials: minimal-privilege key, never the operator or CI key.
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
        // Deploy trace context, exported by deploy-run before the stack update; ignoreChanges on cloudInit keeps existing generations untouched.
        traceparent: process.env.TRACEPARENT,
        // The app's telemetry sink travels via the boot plan: the boot runner carries no vendor endpoint of its own.
        telemetry: {
          endpoint: telemetrySink.endpoint,
          keyHeader: telemetrySink.keyHeader,
          keyEnvVar: telemetrySink.keyEnvVar,
        },
      }),
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
  if (!genPrivateIp)
    throw new Error(`compute: no reserved private IP for ${svc.slug} gen ${generation.id} (pass 1 must run first)`);

  // A new generation must carry its minted handoff reference: no keys file means the mint step did not run, so refuse the plan and never bake an empty credential.
  if (!generation.preexisting && !generationKeys) {
    throw new Error(
      `compute: planning a NEW ${svc.slug} generation without INFRA_GENERATION_KEYS_FILE: deploy via the deploy task (it runs mint-generation-keys first).`,
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
      // A newly rolling generation must have a pinnable boot image; a pre-existing one degrades to its booted image.
      cloudInit: buildCloudInit(serviceConfig, generation.sha, !generation.preexisting),
      ipIds: [ip.id],
    },
    {
      // Generation VMs keep their initial cloud-init and image: changes roll a new content-addressed generation, and ignoring image UUID drift prevents in-place replacement outside LB cutover.
      // IAM grants must exist before the VM's first runtime-secret hydration.
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
  const target =
    appConfig.singleVM && hostSlug && [...coHosted, ...collocated].some((s) => s.slug === slug) ? hostSlug : slug;
  return instances.filter((i) => i.service === target).map((i) => i.privateIp);
}
