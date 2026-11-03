import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  agentBundleScript,
  BUILDER_ARCHIVE_DIR,
  type BuilderLinks,
  builderCloudConfig,
  builderReportPrefix,
  frontendScript,
} from '../lib/builder/builder-machine';
import { readUstar, writeArchiveFiles } from '../lib/deploy/frontend-archive';
import { pinnedNodeImage } from '../lib/deploy/node-image';
import {
  AGENT_IMAGE_NAME,
  type ArchiveDigest,
  frontendArchiveKey,
  parseReleaseManifest,
  type ReleaseManifest,
  releaseArchiveKey,
  releaseManifestKey,
} from '../lib/deploy/release-archives';
import { readRepositoryKey, repositoryUrl } from '../lib/deploy/repository-key';
import { deriveInfra } from '../lib/naming';
import { actionCommand } from '../lib/operator-actions';
import { createMachine, removeMachines } from '../lib/scaleway/machines';
import { bucketPresigner } from '../lib/scaleway/presign';
import { makeS3Client, projectAccessKey } from '../lib/scaleway/s3-client';
import { createSecretManagerClient } from '../lib/scaleway/scaleway-secret-manager';
import { scwErrorStatus, scwFetch } from '../lib/scaleway/scw-fetch';
import { errorMessage } from '../lib/utils/errors';
import { runIfMain } from '../lib/utils/is-main';
import { infraDir } from '../lib/utils/paths';
import { getFlag } from './args';
import { bakeDefinition, parseBuildRows } from './build-images';
import { ENTRY_FILE_NAMES, releaseEntryPrefix, uploadFrontendAssets } from './frontend-assets';
import { frontendBuildEnv } from './frontend-build-env';

// 8 vCPUs: the bake and the frontend build run side by side; about two cents a build.
const BUILDER_TYPE = 'POP2-HC-8C-16G';
const BUILDER_IMAGE = 'docker';
const BUILDER_DISK_BYTES = 40_000_000_000;

/** How long the builder waits for its report, and how long each of its links lasts beyond it. */
const BUILD_TIMEOUT_MS = 30 * 60_000;
const BUILDER_LINK_SECONDS = 60 * 60;

/** What building a release does outside this module, so a test passes its own. */
export interface BuildEffects {
  /** The release's manifest in the boot-diag bucket, or undefined when no build wrote one. */
  manifest(): Promise<ReleaseManifest | undefined>;
  /** True when the bucket holds the archive at `key` as the manifest names it: a single PUT's ETag is its md5, and the size matches. */
  archiveMatches(key: string, digest: ArchiveDigest): Promise<boolean>;
  /** Links for every write of a builder: its reports, each archive by name, the frontend archive and the manifest. */
  links(archives: readonly string[]): Promise<BuilderLinks>;
  /** A private repository's read key, which the builder's cloud-init carries. */
  repositoryKey(): Promise<string | undefined>;
  /** A file under the release's entry prefix in the frontend bucket, or undefined when it is not there. */
  entryFile(name: string): Promise<Buffer | undefined>;
  /** Upload the release's frontend files from its archive, which is checked against its digest first. */
  uploadFrontend(digest: ArchiveDigest): Promise<void>;
  /** Delete every builder machine of the environment with its volume, in every zone of the region; returns the names deleted. */
  removeBuilders(): Promise<string[]>;
  /** Make the builder machine in a zone and start it. */
  startBuilder(zone: string, name: string, cloudConfig: string): Promise<void>;
  /** One of the builder's reports with the time Object Storage stored it, or undefined while none is there. */
  report(name: 'step' | 'log' | 'result'): Promise<{ body: string; modified: Date } | undefined>;
  sleep(ms: number): Promise<void>;
}

export interface BuildReleaseOptions {
  sha: string;
  builderName: string;
  /** The zones the builder may be made in, in the order tried. */
  zones: readonly string[];
  /** Every archive the release has, by image repository name, the agent's included. */
  archives: readonly string[];
  /** Whether the release has frontend files. */
  withFrontend: boolean;
  /** Where the release's entry files are written for the publish and the smoke test. */
  distDir?: string;
  cloudConfig(input: { links: BuilderLinks; repositoryKey?: string }): string;
  timeoutMs?: number;
  pollMs?: number;
  log?: (message: string) => void;
}

/** What of a release is not in the bucket as its manifest names it: archives by name, and `frontend` for the frontend archive. */
async function missingParts(opts: BuildReleaseOptions, fx: BuildEffects, manifest: ReleaseManifest | undefined): Promise<string[]> {
  const missing: string[] = [];
  for (const name of opts.archives) {
    const digest = manifest?.images[name];
    if (!digest || !(await fx.archiveMatches(releaseArchiveKey(opts.sha, name), digest))) missing.push(name);
  }
  if (opts.withFrontend && (!manifest?.frontend || !(await fx.archiveMatches(frontendArchiveKey(opts.sha), manifest.frontend)))) {
    missing.push('frontend');
  }
  return missing;
}

/**
 * Make sure a release is built. When the boot-diag bucket lacks its manifest or an archive the manifest names, a builder machine, made in the
 * first zone that has its type in stock, builds all of them and writes them through the links it was given; a builder a dead deploy left is
 * deleted first, and this one is deleted when it is done or the wait ends. The frontend files are uploaded from their archive when the
 * frontend bucket lacks the release's entry files, which are then written to `distDir`. Returns the release's manifest, checked.
 */
export async function buildRelease(
  opts: BuildReleaseOptions,
  fx: BuildEffects,
): Promise<{ outcome: 'present' | 'built'; manifest: ReleaseManifest }> {
  const log = opts.log ?? ((message: string) => console.info(message));
  // Under the lease, a builder that is there was left by a deploy that ended without deleting it (cancelled, killed): it goes first,
  // whether or not this release needs a build.
  for (const name of await fx.removeBuilders()) log(`  ~ deleted ${name}, left by an earlier deploy`);
  // A manifest that cannot be parsed names no archive: the release is built again, and the build overwrites it.
  const readManifest = () =>
    fx.manifest().catch((error: unknown) => {
      log(`[build] the manifest of ${opts.sha.slice(0, 10)} cannot be read (${errorMessage(error)}): it counts as missing`);
      return undefined;
    });
  let manifest = await readManifest();
  const missing = await missingParts(opts, fx, manifest);

  let outcome: 'present' | 'built' = 'present';
  if (missing.length > 0) {
    outcome = 'built';
    log(`[build] missing for ${opts.sha.slice(0, 10)}: ${missing.join(', ')}; building on ${opts.builderName}`);
    const cloudConfig = opts.cloudConfig({ links: await fx.links(opts.archives), repositoryKey: await fx.repositoryKey() });
    const startedAt = Date.now();
    try {
      for (const [index, zone] of opts.zones.entries()) {
        try {
          await fx.startBuilder(zone, opts.builderName, cloudConfig);
          break;
        } catch (error) {
          const next = opts.zones[index + 1];
          if (!next || !isOutOfStock(error)) throw error;
          // Scaleway makes the machine, then refuses to power it on.
          await fx.removeBuilders();
          log(`  ~ ${zone} has no ${BUILDER_TYPE} in stock: trying ${next}`);
        }
      }
      await waitForBuilder(opts, fx, log, startedAt);
    } finally {
      for (const name of await fx.removeBuilders()) log(`  ~ deleted ${name}`);
    }
    manifest = await readManifest();
    const still = await missingParts(opts, fx, manifest);
    if (still.length > 0) throw new Error(`the builder reported a build, and the bucket lacks ${still.join(', ')} of it`);
  } else {
    log(`[build] ${opts.sha.slice(0, 10)} is built: every archive is there as its manifest names it`);
  }
  if (!manifest) throw new Error(`the release ${opts.sha.slice(0, 10)} has no manifest after its build`);

  if (opts.withFrontend && manifest.frontend && !(await fx.entryFile('index.html'))) {
    log('[build] uploading the frontend files from their archive');
    await fx.uploadFrontend(manifest.frontend);
  }
  if (opts.withFrontend && opts.distDir) {
    await mkdir(opts.distDir, { recursive: true });
    for (const name of ENTRY_FILE_NAMES) {
      const body = await fx.entryFile(name);
      if (body) await writeFile(join(opts.distDir, name), body);
      else if (name === 'index.html') throw new Error(`the release's index.html is not in the frontend bucket after the build`);
    }
  }
  return { outcome, manifest };
}

/** Scaleway's refusal of a machine type a zone has none of: 412 with `"type": "out_of_stock"`. */
function isOutOfStock(error: unknown): boolean {
  return scwErrorStatus(error) === 412 && errorMessage(error).includes('"out_of_stock"');
}

// A report stored up to this long before the start still counts: Last-Modified holds whole seconds, on Object Storage's own clock.
const REPORT_CLOCK_MARGIN_MS = 5_000;

/**
 * Wait for the builder's `result`. Its reports go under the commit's prefix, where every earlier build of the commit left its own: a report
 * stored before `startedAt`, taken before the machine was made, belongs to one of those builds and is not read as this one's.
 */
async function waitForBuilder(opts: BuildReleaseOptions, fx: BuildEffects, log: (message: string) => void, startedAt: number): Promise<void> {
  const deadline = Date.now() + (opts.timeoutMs ?? BUILD_TIMEOUT_MS);
  const report = async (name: 'step' | 'log' | 'result') => {
    const found = await fx.report(name);
    return found && found.modified.getTime() >= startedAt - REPORT_CLOCK_MARGIN_MS ? found.body : undefined;
  };
  let lastStep: string | undefined;
  while (Date.now() < deadline) {
    await fx.sleep(opts.pollMs ?? 15_000);
    const step = (await report('step'))?.trim();
    if (step && step !== lastStep) {
      log(`  ${step} (${Math.round((Date.now() - startedAt) / 1000)} s)`);
      lastStep = step;
    }
    const result = (await report('result'))?.trim();
    if (result === 'ok') {
      log(`✓ built in ${Math.round((Date.now() - startedAt) / 1000)} s`);
      return;
    }
    if (result) {
      const tail = (await report('log')) ?? '';
      // A private repository answers a fetch without its key as if the commit were not there.
      const hint = lastStep === 'clone' ? `\nA private repository needs its read key: \`${actionCommand('repository-key')}\`.` : '';
      throw new Error(`the builder failed at '${lastStep ?? 'its start'}'. The end of its log:\n${tail}${hint}`);
    }
  }
  throw new Error(
    `the builder did not finish within ${Math.round((opts.timeoutMs ?? BUILD_TIMEOUT_MS) / 60_000)} minutes (last step: ${lastStep ?? 'none'})`,
  );
}

/** The name every builder machine of an environment starts with. */
export function builderPrefix(resource: (suffix: string) => string): string {
  return `${resource('builder')}-`;
}

/** Delete every builder machine with its volume in each zone given, as a build makes it in any zone of the region; returns the names deleted. */
export async function removeBuilderMachines(opts: {
  secretKey: string;
  projectId: string;
  zones: readonly string[];
  prefix: string;
}): Promise<string[]> {
  const removed: string[] = [];
  for (const zone of opts.zones) removed.push(...(await removeMachines({ ...opts, zone })));
  return removed;
}

/** The builder's effects on Scaleway, with the deploy key: it signs every link the builder writes through, and reads what the builder wrote. */
function liveEffects(opts: {
  secretKey: string;
  accessKey: string;
  projectId: string;
  region: string;
  zones: readonly string[];
  sha: string;
  frontendBucket: string;
  diagBucket: string;
  builderPrefix: string;
  securityGroupName: string;
}): BuildEffects {
  const auth = { secretKey: opts.secretKey };
  const instance = (zone: string) => `https://api.scaleway.com/instance/v1/zones/${zone}`;
  const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));
  const secrets = createSecretManagerClient({ secretKey: opts.secretKey, region: opts.region, projectId: opts.projectId });
  const accessKey = projectAccessKey(opts.accessKey, opts.projectId);
  const s3 = makeS3Client(opts.region, accessKey, opts.secretKey);
  const presigner = bucketPresigner({ region: opts.region, bucket: opts.diagBucket, accessKey, secretKey: opts.secretKey });
  const getObject = async (key: string) => {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    return (await s3).send(new GetObjectCommand({ Bucket: opts.diagBucket, Key: key }));
  };

  return {
    manifest: async () => {
      const text = await getObject(releaseManifestKey(opts.sha)).then(
        (object) => object.Body?.transformToString(),
        () => undefined,
      );
      return text === undefined ? undefined : parseReleaseManifest(text, opts.sha);
    },
    archiveMatches: async (key, digest) => {
      const { HeadObjectCommand } = await import('@aws-sdk/client-s3');
      const head = await (await s3).send(new HeadObjectCommand({ Bucket: opts.diagBucket, Key: key })).catch(() => undefined);
      return head?.ContentLength === digest.bytes && head.ETag?.replaceAll('"', '') === digest.md5;
    },
    links: async (archives) => {
      const sign = await presigner;
      const put = (key: string) => sign.put(key, BUILDER_LINK_SECONDS);
      const report = builderReportPrefix(opts.sha);
      const links: BuilderLinks = {
        step: await put(`${report}step`),
        log: await put(`${report}log`),
        result: await put(`${report}result`),
        manifest: await put(releaseManifestKey(opts.sha)),
        ...(opts.frontendBucket ? { frontend: await put(frontendArchiveKey(opts.sha)) } : {}),
      };
      for (const name of archives) links[`image:${name}`] = await put(releaseArchiveKey(opts.sha, name));
      return links;
    },
    repositoryKey: () => readRepositoryKey(secrets),
    entryFile: async (name) => {
      const res = await fetch(`https://${opts.frontendBucket}.s3.${opts.region}.scw.cloud/${releaseEntryPrefix(opts.sha)}${name}`);
      return res.ok ? Buffer.from(await res.arrayBuffer()) : undefined;
    },
    uploadFrontend: async (digest) => {
      const object = await getObject(frontendArchiveKey(opts.sha));
      const archive = Buffer.from((await object.Body?.transformToByteArray()) ?? []);
      if (createHash('sha256').update(archive).digest('hex') !== digest.sha256) {
        throw new Error("the frontend archive differs from its manifest's digest: it is not the one the builder wrote");
      }
      const dir = await mkdtemp(join(tmpdir(), 'frontend-'));
      await writeArchiveFiles(readUstar(archive), dir);
      await uploadFrontendAssets({ distDir: dir, bucket: opts.frontendBucket, region: opts.region, sha: opts.sha });
    },
    removeBuilders: () =>
      removeBuilderMachines({ secretKey: opts.secretKey, projectId: opts.projectId, zones: opts.zones, prefix: opts.builderPrefix }),
    startBuilder: async (zone, name, cloudConfig) => {
      const { security_groups } = await scwFetch<{ security_groups: Array<{ id: string; name: string }> }>(
        auth,
        'GET',
        `${instance(zone)}/security_groups?project=${opts.projectId}&name=${encodeURIComponent(opts.securityGroupName)}`,
      );
      const securityGroup = security_groups.find((group) => group.name === opts.securityGroupName);
      if (!securityGroup) throw new Error(`no security group '${opts.securityGroupName}' in ${zone} to put the builder in: an apply makes one`);
      // An address for egress only: the closed security group drops every inbound packet.
      await createMachine(auth, zone, {
        name,
        type: BUILDER_TYPE,
        image: BUILDER_IMAGE,
        projectId: opts.projectId,
        securityGroupId: securityGroup.id,
        tags: ['builder', `sha=${opts.sha}`],
        volumeBytes: BUILDER_DISK_BYTES,
        userData: { 'cloud-init': cloudConfig },
      });
    },
    report: async (name) => {
      try {
        const object = await getObject(`${builderReportPrefix(opts.sha)}${name}`);
        const body = await object.Body?.transformToString();
        return body !== undefined && object.LastModified ? { body, modified: object.LastModified } : undefined;
      } catch {
        return undefined;
      }
    },
    sleep,
  };
}

/**
 * The deploy's step: the deploy key in `SCW_ACCESS_KEY` / `SCW_SECRET_KEY`; names, the repository and the pnpm version from the config. The
 * checked manifest goes to `--manifest-out`, from which the deploy hands each new machine the digests of the archives it loads.
 */
export async function main(argv = process.argv.slice(2)): Promise<void> {
  const accessKey = process.env.SCW_ACCESS_KEY;
  const secretKey = process.env.SCW_SECRET_KEY;
  const sha = getFlag(argv, '--sha');
  const mode = getFlag(argv, '--mode');
  const projectId = getFlag(argv, '--project-id');
  const buildImagesJson = getFlag(argv, '--build-images-json');
  const servicesJson = getFlag(argv, '--services-json');
  const manifestOut = getFlag(argv, '--manifest-out');
  const distDir = getFlag(argv, '--dist') || undefined;
  if (!accessKey || !secretKey || !sha || !mode || !projectId || !buildImagesJson || !servicesJson || !manifestOut) {
    throw new Error('Required: SCW_ACCESS_KEY, SCW_SECRET_KEY, --sha, --mode, --project-id, --build-images-json, --services-json, --manifest-out');
  }
  process.env.APP_MODE = mode;
  const { loadEngineConfig } = await import('../config/engine-config');
  const appConfig = await loadEngineConfig();
  const { naming, region, zones } = deriveInfra(appConfig);
  const rootPackage = JSON.parse(await readFile(join(infraDir, '..', 'package.json'), 'utf8')) as {
    packageManager?: string;
    engines?: { node?: string };
  };
  const repository = repositoryUrl();
  const pnpmVersion = rootPackage.packageManager?.match(/^pnpm@(.+)$/)?.[1];
  if (!pnpmVersion) throw new Error("the builder installs the pnpm the root package.json's 'packageManager' names");
  const nodeVersion = rootPackage.engines?.node;
  if (!nodeVersion) throw new Error("the builder builds on the Node the root package.json's 'engines.node' names");

  const rows = parseBuildRows(buildImagesJson);
  const frontendBucket = distDir ? naming.frontendBucket : '';
  const prefix = builderPrefix(naming.resource);

  const { manifest } = await buildRelease(
    {
      sha,
      builderName: `${prefix}${sha.slice(0, 10)}`,
      zones,
      archives: [...rows.map((row) => row.service), AGENT_IMAGE_NAME],
      withFrontend: Boolean(frontendBucket),
      distDir,
      cloudConfig: ({ links, repositoryKey }) =>
        builderCloudConfig({
          values: {
            SHA: sha,
            REPO: repository,
            REPO_KEY: repositoryKey ?? '',
            // The agent image's base, at the root `engines.node`, by digest.
            NODE_IMAGE: pinnedNodeImage(nodeVersion, 'bookworm-slim'),
            FRONTEND: frontendBucket ? '1' : '',
          },
          links,
          frontendEnv: frontendBucket ? frontendBuildEnv(mode, servicesJson) : {},
          bake: bakeDefinition(rows, {
            registry: `rg.${region}.scw.cloud`,
            namespace: naming.registryNamespace,
            releaseSha: sha,
            nodeVersion,
            context: '/build',
            archiveDir: BUILDER_ARCHIVE_DIR,
          }),
          agent: agentBundleScript(pnpmVersion),
          frontend: frontendBucket ? frontendScript(pnpmVersion) : '',
        }),
    },
    liveEffects({
      secretKey,
      accessKey,
      projectId,
      region,
      zones,
      sha,
      frontendBucket,
      diagBucket: naming.bootDiagBucket,
      builderPrefix: prefix,
      securityGroupName: naming.resource('compute-sg'),
    }),
  );
  await writeFile(manifestOut, JSON.stringify(manifest), { mode: 0o600 });
}

runIfMain(import.meta.url, main);
