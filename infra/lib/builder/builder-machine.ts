import { type CloudConfigFile, cloudConfigDocument } from '../utils/cloud-config';

/** What the script reads from `/etc/builder.env`: no key of Scaleway's. */
export interface BuilderValues {
  SHA: string;
  REPO: string;
  /** A private repository's read key; empty for a repository anyone may read. */
  REPO_KEY: string;
  NODE_IMAGE: string;
  /** `1` when the release has frontend files, else empty. */
  FRONTEND: string;
}

/**
 * The builder's presigned links, one per write it makes, by name: `step`, `log`, `result`, `manifest`, `frontend` and `image:<name>` for
 * each archive. The deploy signs them with its key before it makes the machine; each ends with the build's time limit.
 */
export type BuilderLinks = Record<string, string>;

/**
 * Where the builder writes the release's archives before it uploads them: its disk, which holds them, and not `/run`, a tmpfs in memory.
 * The script names the same folder, as no dollar-brace may appear in it.
 */
export const BUILDER_ARCHIVE_DIR = '/var/lib/release/images';

/** Where the builder reports, in the boot-diagnostics bucket: `step`, `log` and `result` (`ok` or `failed`). */
export function builderReportPrefix(sha: string): string {
  return `boot-diag/builder/${sha}/`;
}

/**
 * The script. Written with String.raw: every backslash reaches bash as it stands, and no dollar-brace may appear. It holds no key: every
 * write is a PUT to a link from `/etc/builder-links.tsv`, and the log it uploads is the script's own output.
 */
export const BUILDER_SCRIPT = String.raw`#!/bin/bash
set -a; . /etc/builder.env; set +a
export HOME=/root GIT_TERMINAL_PROMPT=0
LOG=/var/log/builder.log
exec >>"$LOG" 2>&1
link() { awk -F '\t' -v name="$1" '$1 == name { print $2 }' /etc/builder-links.tsv; }
put() {
  url=$(link "$1")
  [ -n "$url" ] || { echo "no link for $1"; return 1; }
  curl -fsS --retry 3 --retry-all-errors -X PUT -T "$2" "$url" >/dev/null
}
step() {
  echo "$1" > /run/builder.step
  echo "== $(date -u +%FT%TZ) $1"
  put step /run/builder.step || true
}
finish() {
  trap - ERR
  tail -c 12000 "$LOG" > /run/builder.tail
  put log /run/builder.tail || true
  echo "$1" > /run/builder.result
  put result /run/builder.result || true
  shutdown -h now
  exit 0
}
digest() {
  printf '{"sha256":"%s","md5":"%s","bytes":%s}' "$(sha256sum "$1" | cut -d ' ' -f 1)" "$(md5sum "$1" | cut -d ' ' -f 1)" "$(stat -c %s "$1")"
}
trap 'echo "failed at line $LINENO"; finish failed' ERR
set -eE -o pipefail

docker pull -q "$NODE_IMAGE"
# No container reaches the metadata service: the machine's user data holds the repository read key and the links.
iptables -I DOCKER-USER -d 169.254.42.42 -j DROP || iptables -I FORWARD -d 169.254.42.42 -j DROP

step clone
git init -q /build
git -C /build remote add origin "$REPO"
# A private repository's read key (D19) goes with this one fetch as a header: it is in no URL, no remote and no file the build sees.
if [ -n "$REPO_KEY" ]; then
  git -C /build -c http.extraHeader="Authorization: Basic $(printf 'x-access-token:%s' "$REPO_KEY" | base64 -w0)" fetch -q --depth 1 origin "$SHA"
else
  git -C /build fetch -q --depth 1 origin "$SHA"
fi
unset REPO_KEY
git -C /build checkout -q FETCH_HEAD

# A BuildKit container: the docker driver writes no archive per target. Its image by digest, as it runs every build: a BuildKit bump takes
# the index digest that 'docker buildx imagetools inspect moby/buildkit:<version>' prints.
docker buildx create --use --name release --driver docker-container \
  --driver-opt image=moby/buildkit:v0.33.1@sha256:cec9f139f45e93c5c69c60f8b07cfad9f43f4ef6b6a6cd917527fea5ff2e3dea >/dev/null

step build
# The frontend builds on a copy made before anything runs: the app's dependencies reach neither the images' source nor the agent bundle.
if [ -n "$FRONTEND" ]; then cp -a /build /frontend; fi
mkdir -p /var/lib/release/images
docker buildx bake --file /etc/builder-bake.json services &
SERVICES=$!
# Keyless containers: the engine's workspace builds the agent bundle in the checkout, the app's the frontend in its copy.
docker run --rm -v /build:/build -v /etc/builder-agent.sh:/script.sh:ro -w /build "$NODE_IMAGE" bash -eo pipefail /script.sh
docker buildx bake --file /etc/builder-bake.json agent &
AGENT=$!
if [ -n "$FRONTEND" ]; then
  docker run --rm -v /frontend:/build -v /etc/builder-frontend.sh:/script.sh:ro -w /build --env-file /etc/builder-frontend.env "$NODE_IMAGE" bash -eo pipefail /script.sh
fi
wait "$SERVICES"
wait "$AGENT"

step archives
# The manifest goes last: once it is there, every archive it names is.
IMAGES=''
for archive in /var/lib/release/images/*.tar; do
  name=$(basename "$archive" .tar)
  put "image:$name" "$archive"
  if [ -n "$IMAGES" ]; then IMAGES="$IMAGES,"; fi
  IMAGES="$IMAGES\"$name\":$(digest "$archive")"
done
FRONTEND_DIGEST=''
if [ -n "$FRONTEND" ]; then
  # Plain files and folders only, in the format the deploy reads; it refuses any other entry.
  tar --format=ustar -C /frontend/frontend/dist -cf /var/lib/release/frontend.tar .
  put frontend /var/lib/release/frontend.tar
  FRONTEND_DIGEST=",\"frontend\":$(digest /var/lib/release/frontend.tar)"
fi
printf '{"release":"%s","images":{%s}%s}\n' "$SHA" "$IMAGES" "$FRONTEND_DIGEST" > /run/manifest.json
put manifest /run/manifest.json

finish ok
`;

/** The keyless container that builds the agent bundle: the engine's workspace only. */
export function agentBundleScript(pnpmVersion: string): string {
  return [
    `npm install -g --silent pnpm@${pnpmVersion}`,
    "pnpm install --frozen-lockfile --filter 'infra...'",
    'pnpm --filter infra agent:build',
    '',
  ].join('\n');
}

/** The keyless container that builds the frontend on its copy: this environment's OpenAPI spec first, which the docs page serves with its URLs. */
export function frontendScript(pnpmVersion: string): string {
  return [
    `npm install -g --silent pnpm@${pnpmVersion}`,
    "pnpm install --frozen-lockfile --filter 'frontend...' --filter 'backend...'",
    // The spec opens no database and signs nothing: the example env and a placeholder cookie secret only pass validation.
    'cp backend/.env.example backend/.env',
    'COOKIE_SECRET=openapi-spec-placeholder-secret pnpm --filter backend generate:openapi --force',
    'cp backend/openapi.cache.json sdk/gen/openapi.json',
    'pnpm --filter frontend build',
    '',
  ].join('\n');
}

const UNIT = [
  '[Unit]',
  'Description=builder, runs once',
  'After=network-online.target docker.service',
  'Wants=network-online.target',
  '[Service]',
  'Type=oneshot',
  // A backstop: the deploy deletes the machine when it stops waiting.
  'TimeoutStartSec=45min',
  'ExecStart=/usr/local/bin/builder.sh',
].join('\n');

/**
 * The builder machine's cloud-init: the values (a private repository's read key among them), the links it writes through, the bake file,
 * the commands of its keyless containers, the script, and a unit started once. The script runs on Scaleway's `docker` image: it fetches the
 * release's commit, builds the images, the agent bundle and the frontend in containers that hold no key, then writes each archive, the
 * frontend's archive and the manifest through their links, and reports each step to the boot-diagnostics bucket the same way.
 */
export function builderCloudConfig(opts: {
  values: BuilderValues;
  links: BuilderLinks;
  frontendEnv: Record<string, string>;
  bake: unknown;
  agent: string;
  frontend: string;
}): string {
  const files: CloudConfigFile[] = [
    {
      path: '/etc/builder.env',
      permissions: '0600',
      content: Object.entries(opts.values)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n'),
    },
    {
      path: '/etc/builder-links.tsv',
      permissions: '0600',
      content: Object.entries(opts.links)
        .map(([name, url]) => `${name}\t${url}`)
        .join('\n'),
    },
    {
      path: '/etc/builder-frontend.env',
      permissions: '0644',
      content: Object.entries(opts.frontendEnv)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n'),
    },
    { path: '/etc/builder-bake.json', permissions: '0644', content: JSON.stringify(opts.bake, null, 2) },
    { path: '/etc/builder-agent.sh', permissions: '0644', content: opts.agent.trimEnd() },
    { path: '/etc/builder-frontend.sh', permissions: '0644', content: opts.frontend.trimEnd() },
    { path: '/usr/local/bin/builder.sh', permissions: '0755', content: BUILDER_SCRIPT.trimEnd() },
    { path: '/etc/systemd/system/builder.service', permissions: '0644', content: UNIT },
  ];
  return cloudConfigDocument(files, ['systemctl daemon-reload', 'systemctl start --no-block builder.service']);
}
