import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootBundleScript, builderCloudConfig, builderReportPrefix, frontendScript } from '../lib/builder/builder-machine';
import { pinnedNodeImage } from '../lib/deploy/node-image';
import { readRepositoryKey, repositoryUrl } from '../lib/deploy/repository-key';
import { deriveInfra } from '../lib/naming';
import { actionCommand } from '../lib/operator-actions';
import { removeMachines, type ScwServer } from '../lib/scaleway/machines';
import { resolveImageDigest } from '../lib/scaleway/registry-digest';
import { BOOT_IMAGE_NAME } from '../lib/scaleway/release-image';
import { makeS3Client, projectAccessKey } from '../lib/scaleway/s3-client';
import { createSecretManagerClient } from '../lib/scaleway/scaleway-secret-manager';
import { scwFetch, scwSend } from '../lib/scaleway/scw-fetch';
import { runIfMain } from '../lib/utils/is-main';
import { infraDir } from '../lib/utils/paths';
import { getFlag } from './args';
import { bakeDefinition, parseBuildRows } from './build-images';
import { ENTRY_FILE_NAMES } from './frontend-assets';
import { frontendBuildEnv } from './frontend-build-env';
import { releaseEntryPrefix } from './release-files';
import { readStandingKey, stageHandoffBundle } from './stage-generation-keys';

// 8 vCPUs: the bake and the frontend build run side by side; about two cents a build.
const BUILDER_TYPE = 'POP2-HC-8C-16G';
const BUILDER_IMAGE = 'docker';
const BUILDER_DISK_BYTES = 40_000_000_000;

/**
 * The build epoch: a short hash of the builder key's access key id. Every Rotate keys makes a new builder key, and nobody knows its id
 * before, so an image or a frontend file pushed before a rotation never carries the epoch after it, and the release is built again.
 */
export function buildEpoch(builderAccessKey: string): string {
  return createHash('sha256').update(builderAccessKey).digest('hex').slice(0, 12);
}

/** What building a release does outside this module, so a test passes its own. */
export interface BuildEffects {
  /** True when the registry holds the image under the release's tag of this epoch. */
  imagePresent(image: string): Promise<boolean>;
  /** A file under the release's entry prefix in the frontend bucket (an entry file, or the `epoch` marker), or undefined when it is not there. */
  entryFile(name: string): Promise<Buffer | undefined>;
  /** Stage the builder key's read-once bundle; returns its id and the boot key the machine reads it with. */
  keys(): Promise<{ bundleId: string; boot: { accessKey: string; secretKey: string } }>;
  /** Delete every builder machine of the environment with its volume; returns the names deleted. */
  removeBuilders(): Promise<string[]>;
  /** Make the builder machine and start it. */
  startBuilder(name: string, cloudConfig: string): Promise<void>;
  /** One of the builder's reports, or undefined while it has not written it. */
  report(name: 'step' | 'log' | 'result'): Promise<string | undefined>;
  sleep(ms: number): Promise<void>;
}

export interface BuildReleaseOptions {
  sha: string;
  /** The build epoch (`buildEpoch`): a release counts as built only when its images and entry files carry it. */
  epoch: string;
  builderName: string;
  /** Every image repository the release has, the boot runner's included. */
  images: readonly string[];
  /** Whether the release has frontend files. */
  withFrontend: boolean;
  /** Where the release's entry files are written for the publish and the smoke test. */
  distDir?: string;
  cloudConfig(keys: { bundleId: string; boot: { accessKey: string; secretKey: string } }): string;
  timeoutMs?: number;
  pollMs?: number;
  log?: (message: string) => void;
}

/**
 * Make sure a release is built. When the registry lacks one of its images or the frontend bucket its entry files, a builder machine builds and
 * pushes all of them; a builder a dead deploy left is deleted first, and this one is deleted when it is done or the wait ends. The release's
 * entry files are then written to `distDir`. Returns whether the release was already there.
 */
export async function buildRelease(opts: BuildReleaseOptions, fx: BuildEffects): Promise<'present' | 'built'> {
  const log = opts.log ?? ((message: string) => console.info(message));
  // Under the stack lock, a builder that is there was left by a deploy that ended without deleting it (cancelled, killed): it goes first,
  // whether or not this release needs a build.
  for (const name of await fx.removeBuilders()) log(`  ~ deleted ${name}, left by an earlier deploy`);
  const missing: string[] = [];
  for (const image of opts.images) if (!(await fx.imagePresent(image))) missing.push(image);
  if (opts.withFrontend && (!(await fx.entryFile('index.html')) || (await fx.entryFile('epoch'))?.toString() !== opts.epoch)) {
    missing.push('the frontend files');
  }

  let outcome: 'present' | 'built' = 'present';
  if (missing.length > 0) {
    outcome = 'built';
    log(`[build] missing for ${opts.sha.slice(0, 10)}: ${missing.join(', ')}; building on ${opts.builderName}`);
    const keys = await fx.keys();
    try {
      await fx.startBuilder(opts.builderName, opts.cloudConfig(keys));
      await waitForBuilder(opts, fx, log);
    } finally {
      for (const name of await fx.removeBuilders()) log(`  ~ deleted ${name}`);
    }
  } else {
    log(`[build] ${opts.sha.slice(0, 10)} is built: every image and the frontend files are there`);
  }

  if (opts.withFrontend && opts.distDir) {
    await mkdir(opts.distDir, { recursive: true });
    for (const name of ENTRY_FILE_NAMES) {
      const body = await fx.entryFile(name);
      if (body) await writeFile(join(opts.distDir, name), body);
      else if (name === 'index.html') throw new Error(`the release's index.html is not in the frontend bucket after the build`);
    }
  }
  return outcome;
}

async function waitForBuilder(opts: BuildReleaseOptions, fx: BuildEffects, log: (message: string) => void): Promise<void> {
  const deadline = Date.now() + (opts.timeoutMs ?? 30 * 60_000);
  const startedAt = Date.now();
  let lastStep: string | undefined;
  while (Date.now() < deadline) {
    await fx.sleep(opts.pollMs ?? 15_000);
    const step = (await fx.report('step'))?.trim();
    if (step && step !== lastStep) {
      log(`  ${step} (${Math.round((Date.now() - startedAt) / 1000)} s)`);
      lastStep = step;
    }
    const result = (await fx.report('result'))?.trim();
    if (result === 'ok') {
      log(`✓ built in ${Math.round((Date.now() - startedAt) / 1000)} s`);
      return;
    }
    if (result) {
      const tail = (await fx.report('log')) ?? '';
      // A private repository answers a fetch without its key as if the commit were not there.
      const hint = lastStep === 'clone' ? `\nA private repository needs its read key: \`${actionCommand('repository-key')}\`.` : '';
      throw new Error(`the builder failed at '${lastStep ?? 'its start'}'. The end of its log:\n${tail}${hint}`);
    }
  }
  throw new Error(
    `the builder did not finish within ${Math.round((opts.timeoutMs ?? 30 * 60_000) / 60_000)} minutes (last step: ${lastStep ?? 'none'})`,
  );
}

/** The name every builder machine of an environment starts with. */
export function builderPrefix(resource: (suffix: string) => string): string {
  return `${resource('builder')}-`;
}

/** The builder's effects on Scaleway, with the deploy key. */
function liveEffects(opts: {
  secretKey: string;
  accessKey: string;
  projectId: string;
  region: string;
  zone: string;
  slug: string;
  mode: string;
  sha: string;
  epoch: string;
  registry: string;
  namespace: string;
  frontendBucket: string;
  diagBucket: string;
  builderPrefix: string;
  securityGroupName: string;
}): BuildEffects {
  const auth = { secretKey: opts.secretKey };
  const instance = `https://api.scaleway.com/instance/v1/zones/${opts.zone}`;
  const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));
  const secrets = createSecretManagerClient({ secretKey: opts.secretKey, region: opts.region, projectId: opts.projectId });
  const s3 = makeS3Client(opts.region, projectAccessKey(opts.accessKey, opts.projectId), opts.secretKey);

  return {
    imagePresent: (image) =>
      resolveImageDigest({
        registry: `${opts.registry}/${opts.namespace}`,
        image,
        tag: `${opts.sha}-e${opts.epoch}`,
        secretKey: opts.secretKey,
      }).then(
        () => true,
        () => false,
      ),
    entryFile: async (name) => {
      const res = await fetch(`https://${opts.frontendBucket}.s3.${opts.region}.scw.cloud/${releaseEntryPrefix(opts.sha)}${name}`);
      return res.ok ? Buffer.from(await res.arrayBuffer()) : undefined;
    },
    keys: async () => {
      const key = await readStandingKey(secrets, opts.slug, opts.mode, 'builder');
      const boot = await readStandingKey(secrets, opts.slug, opts.mode, 'boot');
      const repositoryKey = await readRepositoryKey(secrets, opts.slug, opts.mode);
      const bundleId = await stageHandoffBundle({
        ...opts,
        principal: 'builder',
        key: { ...key, ...(repositoryKey ? { repositoryKey } : {}) },
        secrets,
        log: (message) => console.info(message),
      });
      return { bundleId, boot };
    },
    removeBuilders: () => removeMachines({ secretKey: opts.secretKey, projectId: opts.projectId, zone: opts.zone, prefix: opts.builderPrefix }),
    startBuilder: async (name, cloudConfig) => {
      const { security_groups } = await scwFetch<{ security_groups: Array<{ id: string; name: string }> }>(
        auth,
        'GET',
        `${instance}/security_groups?project=${opts.projectId}&name=${encodeURIComponent(opts.securityGroupName)}`,
      );
      const securityGroup = security_groups.find((group) => group.name === opts.securityGroupName);
      if (!securityGroup) throw new Error(`no security group '${opts.securityGroupName}' to put the builder in: has the stack's first apply run?`);
      const { server } = await scwFetch<{ server: ScwServer }>(auth, 'POST', `${instance}/servers`, {
        name,
        commercial_type: BUILDER_TYPE,
        image: BUILDER_IMAGE,
        project: opts.projectId,
        // An address for egress only: the closed security group drops every inbound packet.
        dynamic_ip_required: true,
        security_group: securityGroup.id,
        tags: ['builder', `sha=${opts.sha}`],
        volumes: { 0: { size: BUILDER_DISK_BYTES, volume_type: 'sbs_volume' } },
      });
      const set = await fetch(`${instance}/servers/${server.id}/user_data/cloud-init`, {
        method: 'PATCH',
        headers: { 'X-Auth-Token': opts.secretKey, 'Content-Type': 'text/plain' },
        body: cloudConfig,
      });
      if (!set.ok) throw new Error(`setting the builder's cloud-init → ${set.status}: ${await set.text()}`);
      await scwSend(auth, 'POST', `${instance}/servers/${server.id}/action`, { action: 'poweron' });
    },
    report: async (name) => {
      const { GetObjectCommand } = await import('@aws-sdk/client-s3');
      try {
        const object = await (await s3).send(new GetObjectCommand({ Bucket: opts.diagBucket, Key: `${builderReportPrefix(opts.sha)}${name}` }));
        return await object.Body?.transformToString();
      } catch {
        return undefined;
      }
    },
    sleep,
  };
}

/** The deploy's step: the deploy key in `SCW_ACCESS_KEY` / `SCW_SECRET_KEY`; names, the repository and the pnpm version from the config. */
export async function main(argv = process.argv.slice(2)): Promise<void> {
  const accessKey = process.env.SCW_ACCESS_KEY;
  const secretKey = process.env.SCW_SECRET_KEY;
  const sha = getFlag(argv, '--sha');
  const mode = getFlag(argv, '--mode');
  const projectId = getFlag(argv, '--project-id');
  const buildImagesJson = getFlag(argv, '--build-images-json');
  const servicesJson = getFlag(argv, '--services-json');
  const distDir = getFlag(argv, '--dist') || undefined;
  if (!accessKey || !secretKey || !sha || !mode || !projectId || !buildImagesJson || !servicesJson) {
    throw new Error('Required: SCW_ACCESS_KEY, SCW_SECRET_KEY, --sha, --mode, --project-id, --build-images-json, --services-json');
  }
  process.env.APP_MODE = mode;
  const { loadEngineConfig } = await import('../config/engine-config');
  const appConfig = await loadEngineConfig();
  const { naming, region, zone } = deriveInfra(appConfig);
  const rootPackage = JSON.parse(await readFile(join(infraDir, '..', 'package.json'), 'utf8')) as {
    packageManager?: string;
    engines?: { node?: string };
  };
  const repository = repositoryUrl();
  const pnpmVersion = rootPackage.packageManager?.match(/^pnpm@(.+)$/)?.[1];
  if (!pnpmVersion) throw new Error("the builder installs the pnpm the root package.json's 'packageManager' names");
  const nodeVersion = rootPackage.engines?.node;
  if (!nodeVersion) throw new Error("the builder builds on the Node the root package.json's 'engines.node' names");

  const registry = `rg.${region}.scw.cloud`;
  const rows = parseBuildRows(buildImagesJson);
  const secrets = createSecretManagerClient({ secretKey, region, projectId });
  const epoch = buildEpoch((await readStandingKey(secrets, appConfig.slug, mode, 'builder')).accessKey);
  // The layer cache is the epoch's too, so a rotation (after a compromise, keys first) starts a clean one (D13).
  const cacheTag = `buildcache-e${epoch}`;
  const frontendBucket = distDir ? naming.frontendBucket : '';
  const prefix = builderPrefix(naming.resource);

  await buildRelease(
    {
      sha,
      epoch,
      builderName: `${prefix}${sha.slice(0, 10)}`,
      images: [...rows.map((row) => row.service), BOOT_IMAGE_NAME],
      withFrontend: Boolean(frontendBucket),
      distDir,
      cloudConfig: ({ bundleId, boot }) =>
        builderCloudConfig({
          values: {
            SHA: sha,
            REPO: repository,
            REGION: region,
            PROJECT: projectId,
            REGISTRY_HOST: registry,
            DIAG_BUCKET: naming.bootDiagBucket,
            FRONTEND_BUCKET: frontendBucket,
            BUNDLE_ID: bundleId,
            BOOT_AK: boot.accessKey,
            BOOT_SK: boot.secretKey,
            // The boot image's base, at the root `engines.node`, by digest: the builder's keys meet it.
            NODE_IMAGE: pinnedNodeImage(nodeVersion, 'bookworm-slim'),
            EPOCH: epoch,
          },
          frontendEnv: frontendBucket ? frontendBuildEnv(mode, servicesJson) : {},
          bake: bakeDefinition(rows, {
            registry,
            namespace: naming.registryNamespace,
            releaseSha: sha,
            epoch,
            nodeVersion,
            context: '/build',
            cacheTag,
          }),
          boot: bootBundleScript(pnpmVersion),
          frontend: frontendBucket ? frontendScript(pnpmVersion) : '',
        }),
    },
    liveEffects({
      secretKey,
      accessKey,
      projectId,
      region,
      zone,
      slug: appConfig.slug,
      mode,
      sha,
      epoch,
      registry,
      namespace: naming.registryNamespace,
      frontendBucket,
      diagBucket: naming.bootDiagBucket,
      builderPrefix: prefix,
      securityGroupName: naming.resource('compute-sg'),
    }),
  );
}

runIfMain(import.meta.url, main);
