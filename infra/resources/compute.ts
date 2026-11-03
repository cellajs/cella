import * as fs from 'node:fs';
import * as path from 'node:path';
import * as pulumi from '@pulumi/pulumi';
import * as scaleway from '@pulumiverse/scaleway';
import { engineConfig } from '../config/engine-config';
import { telemetrySink } from '../config/telemetry.config';

const appConfig = engineConfig();

import type { ReleaseArchive } from '../boot/src/plan';
import { composeConfig, type ServiceName } from '../compose/compose';
import { sizing } from '../config/sizing';
import { BOOT_IMAGE_NAME, imageRepositoryOf } from '../lib/deploy/release-archives';
import { BOOT_ACCOUNT_LINK_SECONDS, MACHINE_FETCH_LINK_SECONDS, type ReleasePlan, readReleasePlan } from '../lib/deploy/release-plan';
import { bucketPresigner } from '../lib/scaleway/presign';
import { projectAccessKey } from '../lib/scaleway/s3-client';
import type { ServiceDefinition } from '../lib/services';
import { naming, projectId, region, tags, zone, zones } from '../pulumi-context';
import { renderCloudInit } from './cloud-init';
import { createComposeEnvBuilder } from './compose-env';
import { activeGenerations, coHosted, collocated, enabled, type Generation, hostSlug } from './generations';
import { privateNetworkId } from './network';
import { registryEndpoint } from './registry';

/**
 * The release the deploy is making machines of: each new machine's env file, boot account and the archives' digests, which the deploy wrote
 * into INFRA_RELEASE_PLAN_FILE (tasks/deploy-run.ts). Absent on an apply or a preview, where a pre-existing generation ignores its cloud-init;
 * a new one is refused.
 */
const releasePlan = readReleasePlan(process.env.INFRA_RELEASE_PLAN_FILE || undefined);

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

const composeContent = fs.readFileSync(path.resolve(import.meta.dirname, '../compose.gen.yml'), 'utf-8');

interface ServiceConfig {
  name: string;
  profile: string;
  /** Compose services the boot runner starts on this VM: the service plus, on the singleVM host, every collocated container. */
  startServices: [string, ...string[]];
  /** Compose env var suppliers (REGISTRY, URLs, the image tag), lazy so resource-backed values resolve only when VMs are created. */
  composeEnv: Record<string, () => pulumi.Input<string>>;
}

/** The archives a machine loads: one per image repository its compose services run, a reused one once. */
function archivesOf(startServices: readonly string[]): string[] {
  return [...new Set(startServices.map((slug) => imageRepositoryOf(composeConfig.services[slug]?.image ?? '')))];
}

// Signed with this run's own key: the deploy key in a deploy, which reads and writes the objects the links name.
const presigner = bucketPresigner({
  region,
  bucket: naming.bootDiagBucket,
  accessKey: projectAccessKey(process.env.SCW_ACCESS_KEY ?? '', projectId),
  secretKey: process.env.SCW_SECRET_KEY ?? '',
});

/** What a machine's user data names: the boot runner's archive and the links to its env file, its boot account and the app's archives. */
interface MachineLinks {
  bootImage: { image: string; url: string; sha256: string };
  links: { env: string; bootAccount: string; archives: ReleaseArchive[] };
}

/**
 * The links of a new machine of the release, signed now: they start their minutes as the machine is made. A pre-existing generation keeps
 * the user data it booted with (ignoreChanges below), so it gets the objects' plain addresses and no link.
 */
async function machineLinks(plan: ReleasePlan | undefined, service: ServiceConfig, sha: string, registry: string): Promise<MachineLinks> {
  const sign = plan?.release === sha ? await presigner : undefined;
  const unsigned = (key: string) => `https://${naming.bootDiagBucket}.s3.${region}.scw.cloud/${key}`;
  const get = (key: string) => (sign ? sign.get(key, MACHINE_FETCH_LINK_SECONDS) : unsigned(key));
  const archive = async (name: string): Promise<ReleaseArchive> => {
    const entry = plan?.archives[name];
    if (sign && !entry) throw new Error(`compute: the release plan names no archive '${name}', which ${service.name} runs`);
    return { name, image: `${registry}/${name}:${sha}`, url: await get(entry?.key ?? name), sha256: entry?.sha256 ?? '0'.repeat(64) };
  };
  const machine = plan?.machines[service.name];
  if (sign && !machine) throw new Error(`compute: the release plan has no env file for ${service.name}`);
  const boot = await archive(BOOT_IMAGE_NAME);
  return {
    bootImage: { image: boot.image, url: boot.url, sha256: boot.sha256 },
    links: {
      env: await get(machine?.env ?? 'env/'),
      bootAccount: sign && machine ? await sign.put(machine.bootAccount, BOOT_ACCOUNT_LINK_SECONDS) : unsigned(machine?.bootAccount ?? 'boot-diag/'),
      archives: await Promise.all(archivesOf(service.startServices).map(archive)),
    },
  };
}

function buildCloudInit(service: ServiceConfig, releaseSha: string): pulumi.Output<string> {
  const envEntries = Object.entries(service.composeEnv).map(([k, supply]) => pulumi.output(supply()).apply((val) => `${k}=${val}`));
  const envLines = pulumi.all(envEntries);
  // Secret, so the state keeps the links in it under the passphrase until they end.
  return pulumi.secret(
    pulumi.all([envLines, registryEndpoint]).apply(async ([env, registry]) =>
      renderCloudInit({
        slug: naming.slug,
        service: service.name,
        profile: service.profile,
        startServices: service.startServices,
        releaseSha,
        envFileContent: env.join('\n'),
        composeContent,
        ...(await machineLinks(releasePlan, service, releaseSha, registry)),
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

// A Scaleway marketplace label or pinned image UUID, with no plan-time lookup: the boot runner is loaded at startup, so image rotation is ignored.
const computeImageId: pulumi.Input<string> = sizing.computeImage;

function createGenerationVm(svc: ServiceDefinition, generation: Generation): GenerationInstance {
  const resourceName = `vm-${svc.slug}-${generation.id}`;

  // Public IP for egress (the archives and the env file) plus the per-generation private IP reserved in pass 1.
  const ip = new scaleway.instance.Ip(`ip-${svc.slug}-${generation.id}`, { zone, tags });
  const genPrivateIp = genIps.get(genIpKey(svc.slug, generation.id));
  if (!genPrivateIp) throw new Error(`compute: no reserved private IP for ${svc.slug} gen ${generation.id} (pass 1 must run first)`);

  // A new generation carries the links of the deploy's plan: an update without it refuses and never makes a machine that boots nothing. A
  // preview only plans, and on a stack that never had a machine every generation is new.
  if (!generation.preexisting && releasePlan?.release !== generation.sha) {
    if (!pulumi.runtime.isDryRun()) {
      throw new Error(
        `compute: planning a NEW ${svc.slug} generation without INFRA_RELEASE_PLAN_FILE for ${generation.sha}: deploy via the deploy task (it composes the env files and the plan first).`,
      );
    }
    pulumi.log.info(`compute: ${svc.slug} generation ${generation.id} is planned without its links; a deploy signs them as it makes the machine.`);
  }
  const startServices: [string, ...string[]] = [svc.slug, ...(appConfig.singleVM && svc.slug === hostSlug ? collocated.map((s) => s.slug) : [])];
  const serviceConfig: ServiceConfig = {
    name: svc.slug,
    profile: svc.slug,
    startServices,
    composeEnv: buildComposeEnv(svc, () => generation.sha),
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
      cloudInit: buildCloudInit(serviceConfig, generation.sha),
      ipIds: [ip.id],
    },
    {
      // Generation VMs keep their initial cloud-init and image: changes roll a new content-addressed generation, and ignoring image UUID drift prevents in-place replacement outside LB cutover.
      ignoreChanges: ['cloudInit', 'image'],
      // The provider reads all user data back into both outputs after every create and refresh, links included until the deploy strips them,
      // and marks neither secret: the state keeps them under the passphrase.
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
