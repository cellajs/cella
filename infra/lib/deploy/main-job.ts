import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ENGINE_FOLDER } from '../scaleway/secret-paths';
import { infraDir } from '../utils/paths';

/**
 * The main job: one Serverless Jobs definition per environment, made by the operator's apply, that runs one deploy of a target
 * per run on the engine image the apply published. Its keys arrive by secret reference; the target and the retry counter by the start call,
 * which anyone who reads job runs can see, so they are the only values a start carries.
 */

/** The deploy key's copy the main job's definition references: `{ accessKey, secretKey }`, written when the key is made or replaced. */
const DEPLOY_KEY_SECRET_NAME = 'deploy-key';

/** The folder of the secrets the definition references: the engine's, which only the operator reads. */
const MAIN_JOB_SECRET_FOLDER = ENGINE_FOLDER.replace(/\/$/, '');

/** How a run ends, as its exit code. The runner starts a target once; a blocked one waits for the operator. */
export const MAIN_JOB_EXIT = {
  /** The target is live: deployed by this run, or already serving (`unchanged` in the record). */
  deployed: 0,
  /** The deploy failed; a role it had not switched still serves the release before. A failed target is not started again by itself. */
  failed: 1,
  /**
   * A required runtime value is missing, which the run's record names, or the target needs an apply (`apply needed`): Manage runtime
   * secrets stores the value, the apply makes one it owns or publishes the target's description, and both start the target again at their end.
   */
  blocked: 2,
} as const;

/**
 * How a run ended, for a person and the runner. Scaleway reports a run that exited 0 as `succeeded` with no exit code, so the state says
 * deployed; a `failed` run's exit code tells blocked from failed; every other end (an interrupted run) is failed.
 */
export function mainJobOutcome(run: { state: string; exit_code?: number | null }): 'deployed' | 'blocked' | 'failed' {
  if (run.state === 'succeeded') return 'deployed';
  if (run.state === 'failed' && run.exit_code === MAIN_JOB_EXIT.blocked) return 'blocked';
  return 'failed';
}

/** The root `package.json`'s `engines.node`: the Node every run of the engine and the runner starts on. */
export function rootNodeVersion(root = join(infraDir, '..')): string {
  return (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { engines: { node: string } }).engines.node;
}

/**
 * The names a run's engine sees, all others dropped: the target and the retry counter a start sets, the deploy key the definition
 * references and the project. A start call may set any other name too (`NODE_OPTIONS`, `GIT_CONFIG_*`, `RELEASES_ONLY`); none reaches
 * Node, git or the release check.
 */
export const MAIN_JOB_ENV_NAMES = ['TARGET_SHA', 'RETRY', 'DEPLOY_KEY_JSON', 'SCW_DEFAULT_PROJECT_ID', 'SCW_DEFAULT_ORGANIZATION_ID'] as const;

/**
 * The run's first program, in the engine image an apply published: it hands over to the image's own `main-job` task with an environment
 * of {@link MAIN_JOB_ENV_NAMES} alone, whose exit code is the run's. Nothing is fetched or installed: the run is the image, the target is
 * only built and checked by it. POSIX sh reads no startup file when it runs a command string.
 */
export const MAIN_JOB_SCRIPT = `cd /engine || exit 1
exec /usr/bin/env -i PATH=/usr/local/bin:/usr/bin:/bin HOME=/root ${MAIN_JOB_ENV_NAMES.map((name) => `${name}="$${name}"`).join(' ')} pnpm --silent --filter infra main-job
`;

/** The main job's definition as the last apply publishes it (D-b): the apply writes it, and the inventory compares the live one against it. */
export interface MainJobDeclaration {
  imageUri: string;
  startupCommands: string[];
  env: Record<string, string>;
  /** The secrets a run reads, by the env var each lands in: its name in {@link secretFolder}. An optional one may be missing from an older stack. */
  secretReferences: Record<string, { name: string; optional?: true }>;
  secretFolder: string;
}

/**
 * The declared definition of an environment's main job: the engine image by digest, the script and the project.
 * @throws for an image named by a tag, which can move to another image
 */
export function declaredMainJob(opts: { projectId: string; organizationId: string; image: string }): MainJobDeclaration {
  if (!/@sha256:[0-9a-f]{64}$/.test(opts.image)) throw new Error(`the main job runs the engine image by its digest, got '${opts.image}'`);
  return {
    imageUri: opts.image,
    startupCommands: ['/bin/sh', '-c', MAIN_JOB_SCRIPT],
    env: { SCW_DEFAULT_PROJECT_ID: opts.projectId, SCW_DEFAULT_ORGANIZATION_ID: opts.organizationId },
    // The deploy key only: a deploy plans no stack, so its runs read no passphrase.
    secretReferences: { DEPLOY_KEY_JSON: { name: DEPLOY_KEY_SECRET_NAME } },
    secretFolder: MAIN_JOB_SECRET_FOLDER,
  };
}

/** The Secret Manager calls that store the deploy key's copy. */
interface DeployKeySecrets {
  ensureSecret(input: { name: string; path: string; description: string }): Promise<{ id: string }>;
  putSecretValue(input: { secretId: string; value: string; description: string; disablePrevious: boolean }): Promise<unknown>;
}

/**
 * Store the deploy key's copy the main job's definition references, in the engine folder, on the operator key: done when a setup or a
 * rotation of keys makes the key, so a run always starts with the key that is valid. The earlier version is disabled.
 */
export async function storeDeployKeyCopy(secrets: DeployKeySecrets, key: { accessKey: string; secretKey: string }): Promise<void> {
  const container = await secrets.ensureSecret({
    name: DEPLOY_KEY_SECRET_NAME,
    path: MAIN_JOB_SECRET_FOLDER,
    description: "The deploy key, for the main job's runs (referenced by its definition)",
  });
  await secrets.putSecretValue({
    secretId: container.id,
    value: JSON.stringify({ accessKey: key.accessKey, secretKey: key.secretKey }),
    description: 'Written when the deploy key was made',
    disablePrevious: true,
  });
}
