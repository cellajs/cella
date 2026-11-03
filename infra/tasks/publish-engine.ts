import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { EngineConfig } from '../config/engine-config';
import { appDescriptionHash } from '../lib/deploy/app-description';
import { type AppliedEngine, ENGINE_IMAGE_NAME, engineImageRef, engineImageRepository, writeAppliedEngine } from '../lib/deploy/applied-engine';
import { rootNodeVersion } from '../lib/deploy/main-job';
import { pinnedNodeImage } from '../lib/deploy/node-image';
import { COMMIT } from '../lib/deploy/target';
import { deriveInfra } from '../lib/naming';
import { projectAccessKey } from '../lib/scaleway/s3-client';
import { type ScwAuth, scwFetch, scwSend } from '../lib/scaleway/scw-fetch';
import { makeControlClient } from '../lib/stack/control-store';
import { exitCodeOf } from '../lib/utils/child-exit';
import { errorMessage } from '../lib/utils/errors';
import { infraDir } from '../lib/utils/paths';

/** What the image copies of the checkout (infra/Dockerfile), relative to its root. */
const CONTEXT_PATHS = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'shared', 'infra'];

/** An engine image an apply built and pushed, with what `applied.json` records of it once the apply's `up` completed. */
export interface PublishedEngine {
  /** The image by digest, as the main job's definition names it. */
  image: string;
  imageDigest: string;
  descriptionHash: string;
  commit: string;
  /** The registry's tag of this push, which a declined plan deletes. */
  tagId: string;
}

/** How many engine images beside the applied one the registry keeps, newest first: a run started before the apply may still pull one. */
const KEPT_EARLIER_ENGINES = 2;

/** One tag of the engine image as the registry lists it. */
interface EngineTag {
  id: string;
  name: string;
  digest?: string;
  created_at?: string;
}

const registryBase = (region: string) => `https://api.scaleway.com/registry/v1/regions/${region}`;

/** The environment's registry namespace, or undefined before the first apply made it. */
async function findNamespace(auth: ScwAuth, region: string, projectId: string, name: string): Promise<{ id: string } | undefined> {
  const { namespaces = [] } = await scwFetch<{ namespaces?: Array<{ id: string; name: string }> }>(
    auth,
    'GET',
    `${registryBase(region)}/namespaces?project_id=${projectId}&name=${encodeURIComponent(name)}`,
  );
  return namespaces.find((namespace) => namespace.name === name);
}

/** The engine image's tags in the namespace, newest first; none before the first push. */
async function engineTags(auth: ScwAuth, region: string, namespaceId: string, name?: string): Promise<EngineTag[]> {
  const { images = [] } = await scwFetch<{ images?: Array<{ id: string; name: string }> }>(
    auth,
    'GET',
    `${registryBase(region)}/images?namespace_id=${namespaceId}&name=${ENGINE_IMAGE_NAME}`,
  );
  const image = images.find((candidate) => candidate.name === ENGINE_IMAGE_NAME);
  if (!image) return [];
  const tags: EngineTag[] = [];
  for (let page = 1; page <= 20; page++) {
    const { tags: listed = [], total_count = 0 } = await scwFetch<{ tags?: EngineTag[]; total_count?: number }>(
      auth,
      'GET',
      `${registryBase(region)}/images/${image.id}/tags?page=${page}&page_size=100${name ? `&name=${encodeURIComponent(name)}` : ''}`,
    );
    tags.push(...listed);
    if (listed.length === 0 || tags.length >= total_count) break;
  }
  return tags.sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
}

/** Delete one tag; one that shares its image with another tag stays, as the registry refuses that without force, which is never sent. */
const deleteTag = (auth: ScwAuth, region: string, tagId: string) => scwSend(auth, 'DELETE', `${registryBase(region)}/tags/${tagId}`);

/**
 * The build context: the checkout's tracked files under {@link CONTEXT_PATHS}, as they stand in the working tree. An untracked file stays
 * out, so a key, a debug capture or a state backup a person left beside the code never reaches the image.
 */
function stageContext(root: string): string {
  const listed = spawnSync('git', ['ls-files', '-z', '--cached', '--', ...CONTEXT_PATHS], { cwd: root, encoding: 'utf8' });
  if (listed.status !== 0) throw new Error(`git ls-files failed: ${listed.stderr.trim()}`);
  const dir = mkdtempSync(join(tmpdir(), 'engine-context-'));
  for (const file of listed.stdout.split('\0').filter(Boolean)) {
    if (!existsSync(join(root, file))) continue;
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    copyFileSync(join(root, file), join(dir, file));
  }
  return dir;
}

/**
 * A Docker config of its own for the push, deleted after it: the registry's login with the operator's key inline, and the person's CLI
 * plugins (buildx). The key never reaches the person's credential store, and the daemon is the one their current context names.
 */
function pushConfig(registry: string, secretKey: string): { dir: string; env: NodeJS.ProcessEnv } {
  const host =
    process.env.DOCKER_HOST ??
    (spawnSync('docker', ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'], { encoding: 'utf8' }).stdout ?? '').trim();
  const dir = mkdtempSync(join(tmpdir(), 'engine-docker-'));
  writeFileSync(
    join(dir, 'config.json'),
    JSON.stringify({ auths: { [registry]: { auth: Buffer.from(`nologin:${secretKey}`).toString('base64') } } }),
    {
      mode: 0o600,
    },
  );
  const plugins = join(homedir(), '.docker', 'cli-plugins');
  if (existsSync(plugins)) symlinkSync(plugins, join(dir, 'cli-plugins'));
  return { dir, env: { ...process.env, DOCKER_CONFIG: dir, ...(host ? { DOCKER_HOST: host } : {}) } };
}

/**
 * Build the engine image from this checkout and push it to the environment's registry on the operator key: what Review & apply changes
 * and the setup do before the `up` that writes the main job's definition. Undefined while the registry namespace does not exist, as
 * before the first apply. Needs Docker with buildx, able to build linux/amd64.
 * @throws when the build or the push fails, or the registry names no digest for the tag
 */
export async function publishEngine(opts: {
  appConfig: EngineConfig;
  projectId: string;
  secretKey: string;
  root?: string;
  log?: (message: string) => void;
}): Promise<PublishedEngine | undefined> {
  const root = opts.root ?? join(infraDir, '..');
  const log = opts.log ?? ((message: string) => console.info(message));
  const auth = { secretKey: opts.secretKey };
  const { naming, region } = deriveInfra(opts.appConfig);
  const namespace = await findNamespace(auth, region, opts.projectId, naming.registryNamespace);
  if (!namespace) return undefined;
  const git = (args: string[]) => (spawnSync('git', args, { cwd: root, encoding: 'utf8' }).stdout ?? '').trim();
  const commit = git(['rev-parse', 'HEAD']);
  if (!COMMIT.test(commit)) throw new Error('the engine image names the commit it is built from: run the apply from a git checkout');
  // Tracked files only, as the image holds no untracked one.
  if (git(['status', '--porcelain', '--untracked-files=no', '--', ...CONTEXT_PATHS])) {
    log(`  The engine image carries changes ${commit.slice(0, 10)} does not hold; applied.json names that commit all the same.`);
  }
  const descriptionHash = await appDescriptionHash(root);
  const repository = engineImageRepository(region, naming.registryNamespace);
  // A tag per push: one pushed again would move off the image the main job may still run, which no other tag then keeps.
  const tag = `${commit}-${new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+Z$/, 'Z')}`;
  const context = stageContext(root);
  const docker = pushConfig(`rg.${region}.scw.cloud`, opts.secretKey);
  try {
    log(`→ Building the engine image from ${commit.slice(0, 10)} for ${opts.appConfig.mode} and pushing it to ${repository}…`);
    const args = [
      'buildx',
      'build',
      '--platform',
      'linux/amd64',
      // One image manifest: an attestation would make the push an index.
      '--provenance=false',
      '--sbom=false',
      '--file',
      'infra/Dockerfile',
      '--build-arg',
      `NODE_IMAGE=${pinnedNodeImage(rootNodeVersion(root), 'bookworm')}`,
      '--build-arg',
      `ENGINE_MODE=${opts.appConfig.mode}`,
      '--build-arg',
      `DESCRIPTION_HASH=${descriptionHash}`,
      '--tag',
      `${repository}:${tag}`,
      '--push',
      '.',
    ];
    const status = await exitCodeOf(spawn('docker', args, { cwd: context, env: docker.env, stdio: ['ignore', 'inherit', 'inherit'] }));
    if (status !== 0) throw new Error(`docker buildx build exited ${status}: the apply builds the engine image with Docker and buildx`);
    const pushed = (await engineTags(auth, region, namespace.id, tag)).find((candidate) => candidate.name === tag);
    if (!pushed?.digest) throw new Error(`the registry has no digest for ${ENGINE_IMAGE_NAME}:${tag} after the push`);
    return { image: engineImageRef(repository, pushed.digest), imageDigest: pushed.digest, descriptionHash, commit, tagId: pushed.id };
  } finally {
    rmSync(docker.dir, { recursive: true, force: true });
    rmSync(context, { recursive: true, force: true });
  }
}

/** Record the engine an apply published, once its `up` wrote the definition that runs it: `applied.json`, on the operator key. */
export async function recordAppliedEngine(opts: {
  appConfig: EngineConfig;
  stack: string;
  projectId: string;
  key: { accessKey: string; secretKey: string };
  engine: PublishedEngine;
}): Promise<AppliedEngine> {
  const { naming, region } = deriveInfra(opts.appConfig);
  const s3 = await makeControlClient(region, projectAccessKey(opts.key.accessKey, opts.projectId), opts.key.secretKey);
  const applied: AppliedEngine = {
    descriptionHash: opts.engine.descriptionHash,
    imageDigest: opts.engine.imageDigest,
    commit: opts.engine.commit,
    appliedAt: new Date().toISOString(),
  };
  await writeAppliedEngine(s3, naming.bootDiagBucket, opts.stack, applied);
  return applied;
}

/** Delete the tag a push left for a plan the operator declined: no definition names its image. A tag that shares its image stays. */
export async function discardEngine(opts: { appConfig: EngineConfig; secretKey: string; engine: PublishedEngine }): Promise<void> {
  const { region } = deriveInfra(opts.appConfig);
  await deleteTag({ secretKey: opts.secretKey }, region, opts.engine.tagId).catch((error: unknown) =>
    console.info(`  The engine image pushed for this plan stays in the registry (${errorMessage(error)}).`),
  );
}

/**
 * Delete the engine images an apply no longer returns to, once it recorded its own: every tag but the ones of the applied image and the
 * {@link KEPT_EARLIER_ENGINES} newest others. Returns the tags deleted; one the registry refuses stays.
 */
export async function pruneEngines(opts: {
  appConfig: EngineConfig;
  projectId: string;
  secretKey: string;
  applied: PublishedEngine;
}): Promise<string[]> {
  const auth = { secretKey: opts.secretKey };
  const { naming, region } = deriveInfra(opts.appConfig);
  const namespace = await findNamespace(auth, region, opts.projectId, naming.registryNamespace);
  if (!namespace) return [];
  const earlier = (await engineTags(auth, region, namespace.id)).filter((tag) => tag.digest !== opts.applied.imageDigest);
  const deleted: string[] = [];
  for (const tag of earlier.slice(KEPT_EARLIER_ENGINES)) {
    await deleteTag(auth, region, tag.id).then(
      () => deleted.push(tag.name),
      (error: unknown) => console.info(`  ${ENGINE_IMAGE_NAME}:${tag.name} stays (${errorMessage(error)}).`),
    );
  }
  return deleted;
}
