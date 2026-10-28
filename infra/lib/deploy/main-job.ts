import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ENCRYPTION_SALT_SECRET_NAME, PASSPHRASE_SECRET_NAME } from '../../tasks/passphrase-custody';
import { deployFolderPath, engineSecretPath } from '../scaleway/secret-paths';
import { infraDir } from '../utils/paths';
import { defaultRule } from './target';

/**
 * The main job (plan §3.5): one Serverless Jobs definition per environment, made by the operator's apply, that runs one deploy of a target
 * per run. Its keys arrive by secret reference; the target and the retry counter by the start call, which anyone who reads job runs can see,
 * so they are the only values a start carries.
 */

/** The deploy key's copy the main job's definition references: `{ accessKey, secretKey }`, written when the key is made or replaced. */
const DEPLOY_KEY_SECRET_NAME = 'deploy-key';

/** The folder of the secrets the definition references: the engine's, which only the operator reads. */
function mainJobSecretFolder(slug: string, mode: string): string {
  return engineSecretPath(slug, mode).replace(/\/$/, '');
}

/** How a run ends, as its exit code. The runner starts a target once; a blocked one is started again by the action that clears the block (D21). */
export const MAIN_JOB_EXIT = {
  /** The target is live. */
  deployed: 0,
  /** The deploy failed; the running release is untouched or rolled back. A failed target is not started again by itself. */
  failed: 1,
  /**
   * Something only the operator makes is owed, and the run's record names it: a privileged change, which the apply makes, or a required secret,
   * which Manage runtime secrets stores. Either action starts the target again at its end.
   */
  blocked: 2,
} as const;

/**
 * How a run ended, for a person and the runner. Scaleway reports a run that exited 0 as `succeeded` with no exit code, so the state says
 * deployed; a `failed` run's exit code tells blocked from failed; every other end (cancelled, an internal error) is failed.
 */
export function mainJobOutcome(run: { state: string; exit_code?: number | null }): 'deployed' | 'blocked' | 'failed' {
  if (run.state === 'succeeded') return 'deployed';
  if (run.state === 'failed' && run.exit_code === MAIN_JOB_EXIT.blocked) return 'blocked';
  return 'failed';
}

/**
 * The public image a run starts from, at the root `engines.node` (D26): Debian with git and curl, and nothing of the app's. Everything else
 * is fetched by the run. The image is part of the definition, so a Node bump owes an apply.
 */
function mainJobImage(nodeVersion: string): string {
  return `docker.io/library/node:${nodeVersion}-bookworm`;
}

/** The root `package.json`'s `engines.node`: the Node every run of the engine and the runner starts on. */
export function rootNodeVersion(root = join(infraDir, '..')): string {
  return (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { engines: { node: string } }).engines.node;
}

/**
 * The script's refusal of a target no release names, where the definition sets `RELEASES_ONLY=1` (D3): before the fetch, the repository's
 * release tags must name `TARGET_SHA`, an annotated tag by the commit it points to. It runs before any code of the target, so the target cannot
 * skip it; a start call that sets its own values or command can, and Show runs flags such a run. It calls `git_read`, which the script defines.
 */
export const RELEASE_CHECK = String.raw`if [ "$(printenv RELEASES_ONLY || true)" = 1 ]; then
  TAGS=$(git_read ls-remote origin 'refs/tags/*')
  if ! printf '%s\n' "$TAGS" | awk -v sha="$TARGET_SHA" '
    { ref = $2; peeled = (substr(ref, length(ref) - 2) == "^{}"); if (peeled) ref = substr(ref, 1, length(ref) - 3) }
    ref !~ /^refs\/tags\/[0-9]+\.[0-9]+\.[0-9]+$/ { next }
    peeled { commit[ref] = $1 ""; next }
    !(ref in commit) { commit[ref] = $1 "" }
    END { for (ref in commit) if (commit[ref] == sha "") exit 0; exit 1 }'; then
    echo "$MODE deploys releases only: $TARGET_SHA is no release" >&2
    exit 1
  fi
fi`;

/**
 * The run's first program, written into the definition at the apply: it fetches the target commit (with the repository read key for a
 * private repository, read with the deploy key), installs the engine's workspace from the frozen lockfile and the Pulumi CLI at its SDK
 * version, and hands over to the target's own `main-job` task, whose exit code is the run's; a failure before it ends the run with 1, so a
 * tool's own exit code is never read as blocked. Written with String.raw: the one dollar-brace places {@link RELEASE_CHECK}, no other may
 * appear, and keys are never echoed.
 */
export const MAIN_JOB_SCRIPT = String.raw`set -euo pipefail
# A failure before the deploy task ends the run as failed: only the task's own exit code says deployed (0) or blocked (2).
trap 'code=$?; echo "== $(date -u +%FT%TZ) the run stopped before the deploy (exit $code)" >&2; exit 1' ERR
: "$TARGET_SHA" "$MODE" "$REPO" "$REGION" "$DEPLOY_KEY_JSON" "$PULUMI_CONFIG_PASSPHRASE"
export HOME=/root GIT_TERMINAL_PROMPT=0
export SCW_ACCESS_KEY=$(node -e 'process.stdout.write(JSON.parse(process.env.DEPLOY_KEY_JSON).accessKey)')
export SCW_SECRET_KEY=$(node -e 'process.stdout.write(JSON.parse(process.env.DEPLOY_KEY_JSON).secretKey)')
unset DEPLOY_KEY_JSON
echo "== $(date -u +%FT%TZ) fetch $TARGET_SHA"
git init -q /work
git -C /work remote add origin "$REPO"
# A private repository's read key (D19), from the deploy folder, goes as a header with the tag listing and the fetch.
REPO_KEY=$(node -e '
  const base = "https://api.scaleway.com/secret-manager/v1beta1/regions/" + process.env.REGION;
  const headers = { "X-Auth-Token": process.env.SCW_SECRET_KEY };
  const path = process.env.DEPLOY_FOLDER;
  fetch(base + "/secrets?project_id=" + process.env.SCW_DEFAULT_PROJECT_ID + "&name=repository-read-key&path=" + encodeURIComponent(path), { headers })
    .then((res) => res.json())
    .then(async ({ secrets = [] }) => {
      const found = secrets.find((secret) => secret.version_count > 0);
      if (!found) return;
      const res = await fetch(base + "/secrets/" + found.id + "/versions/latest/access", { headers });
      if (!res.ok) throw new Error("the repository read key could not be read: " + res.status);
      process.stdout.write(Buffer.from((await res.json()).data, "base64").toString().trim());
    });
')
git_read() {
  if [ -n "$REPO_KEY" ]; then
    git -C /work -c http.extraHeader="Authorization: Basic $(printf 'x-access-token:%s' "$REPO_KEY" | base64 -w0)" "$@"
  else
    git -C /work "$@"
  fi
}
${RELEASE_CHECK}
git_read fetch -q --depth 1 origin "$TARGET_SHA"
unset REPO_KEY
git -C /work checkout -q FETCH_HEAD
cd /work
echo "== $(date -u +%FT%TZ) install"
# Install scripts run without the deploy key or the passphrase in their environment.
keyless() { env -u SCW_ACCESS_KEY -u SCW_SECRET_KEY -u PULUMI_CONFIG_PASSPHRASE "$@"; }
keyless npm install -g --silent "$(node -p 'require("./package.json").packageManager.replace(/\+.*$/, "")')"
keyless pnpm install --frozen-lockfile --filter 'infra...' --filter 'shared...'
PULUMI_VERSION=$(node -p 'require("./infra/node_modules/@pulumi/pulumi/package.json").version')
# The CLI at the SDK's version, from its release archive. A job runs as root with no capability, so tar must not try to restore owners.
curl -fsSL "https://get.pulumi.com/releases/sdk/pulumi-v$PULUMI_VERSION-linux-x64.tar.gz" | tar -xz --no-same-owner -C /usr/local
export PATH="/usr/local/pulumi:$PATH"
# The salt kept beside the passphrase goes into the target's stack file, so any commit decrypts the state, an older release's too.
SALT=$(printenv PULUMI_ENCRYPTION_SALT || true)
if [ -n "$SALT" ]; then
  node -e 'const fs = require("fs"); const [file, salt] = process.argv.slice(1); const text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : ""; fs.writeFileSync(file, /^encryptionsalt:.*$/m.test(text) ? text.replace(/^encryptionsalt:.*$/m, "encryptionsalt: " + salt) : "encryptionsalt: " + salt + "\n" + text)' "infra/Pulumi.$MODE.yaml" "$SALT"
fi
echo "== $(date -u +%FT%TZ) deploy"
exec pnpm --silent --filter infra main-job
`;

/** The main job's definition as this checkout declares it (D-b): the apply writes it, and the inventory compares the live one against it. */
export interface MainJobDeclaration {
  imageUri: string;
  startupCommands: string[];
  env: Record<string, string>;
  /** The secrets a run reads, by the env var each lands in: its name in {@link secretFolder}. An optional one may be missing from an older stack. */
  secretReferences: Record<string, { name: string; optional?: true }>;
  secretFolder: string;
}

/** The declared definition of an environment's main job, from its names and the checkout's repository and `engines.node`. */
export function declaredMainJob(opts: {
  slug: string;
  mode: string;
  projectId: string;
  organizationId: string;
  region: string;
  repository: string;
  nodeVersion: string;
}): MainJobDeclaration {
  return {
    imageUri: mainJobImage(opts.nodeVersion),
    startupCommands: ['bash', '-c', MAIN_JOB_SCRIPT],
    env: {
      MODE: opts.mode,
      REPO: opts.repository,
      REGION: opts.region,
      DEPLOY_FOLDER: deployFolderPath(opts.slug, opts.mode).replace(/\/$/, ''),
      SCW_DEFAULT_PROJECT_ID: opts.projectId,
      SCW_DEFAULT_ORGANIZATION_ID: opts.organizationId,
      ...(defaultRule(opts.mode).kind === 'releases' ? { RELEASES_ONLY: '1' } : {}),
    },
    secretReferences: {
      DEPLOY_KEY_JSON: { name: DEPLOY_KEY_SECRET_NAME },
      PULUMI_CONFIG_PASSPHRASE: { name: PASSPHRASE_SECRET_NAME },
      // A stack set up before the salt was kept beside the passphrase has none yet: its runs read the target's stack file.
      PULUMI_ENCRYPTION_SALT: { name: ENCRYPTION_SALT_SECRET_NAME, optional: true },
    },
    secretFolder: mainJobSecretFolder(opts.slug, opts.mode),
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
export async function storeDeployKeyCopy(
  secrets: DeployKeySecrets,
  opts: { slug: string; mode: string; key: { accessKey: string; secretKey: string } },
): Promise<void> {
  const container = await secrets.ensureSecret({
    name: DEPLOY_KEY_SECRET_NAME,
    path: mainJobSecretFolder(opts.slug, opts.mode),
    description: "The deploy key, for the main job's runs (referenced by its definition)",
  });
  await secrets.putSecretValue({
    secretId: container.id,
    value: JSON.stringify({ accessKey: opts.key.accessKey, secretKey: opts.key.secretKey }),
    description: 'Written when the deploy key was made',
    disablePrevious: true,
  });
}
