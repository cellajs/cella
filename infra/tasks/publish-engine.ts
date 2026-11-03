import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { EngineConfig } from '../config/engine-config';
import { appDescriptionHash } from '../lib/deploy/app-description';
import { type AppliedEngine, ENGINE_IMAGE_NAME, engineImageRef, engineImageRepository, writeAppliedEngine } from '../lib/deploy/applied-engine';
import { rootNodeVersion } from '../lib/deploy/main-job';
import { pinnedNodeImage } from '../lib/deploy/node-image';
import { deriveInfra } from '../lib/naming';
import { projectAccessKey } from '../lib/scaleway/s3-client';
import { type ScwAuth, scwFetch } from '../lib/scaleway/scw-fetch';
import { makeControlClient } from '../lib/stack/control-store';
import { exitCodeOf } from '../lib/utils/child-exit';
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

/** The digest the registry serves for a tag: the manifest the push left, whatever the local builder calls its image. */
async function tagDigest(auth: ScwAuth, region: string, namespaceId: string, tag: string): Promise<string> {
  const { images = [] } = await scwFetch<{ images?: Array<{ id: string; name: string }> }>(
    auth,
    'GET',
    `${registryBase(region)}/images?namespace_id=${namespaceId}&name=${ENGINE_IMAGE_NAME}`,
  );
  const image = images.find((candidate) => candidate.name === ENGINE_IMAGE_NAME);
  if (!image) throw new Error(`the registry lists no ${ENGINE_IMAGE_NAME} image after the push`);
  const { tags = [] } = await scwFetch<{ tags?: Array<{ name: string; digest?: string }> }>(
    auth,
    'GET',
    `${registryBase(region)}/images/${image.id}/tags?name=${encodeURIComponent(tag)}`,
  );
  const digest = tags.find((candidate) => candidate.name === tag)?.digest;
  if (!digest) throw new Error(`the registry has no digest for ${ENGINE_IMAGE_NAME}:${tag} after the push`);
  return digest;
}

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
  const commit = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error('the engine image names the commit it is built from: run the apply from a git checkout');
  const descriptionHash = await appDescriptionHash(root);
  const repository = engineImageRepository(region, naming.registryNamespace);
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
      `${repository}:${commit}`,
      '--push',
      '.',
    ];
    const status = await exitCodeOf(spawn('docker', args, { cwd: context, env: docker.env, stdio: ['ignore', 'inherit', 'inherit'] }));
    if (status !== 0) throw new Error(`docker buildx build exited ${status}: the apply builds the engine image with Docker and buildx`);
    const imageDigest = await tagDigest(auth, region, namespace.id, commit);
    return { image: engineImageRef(repository, imageDigest), imageDigest, descriptionHash, commit };
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
