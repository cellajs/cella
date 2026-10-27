import { type CloudConfigFile, cloudConfigDocument } from '../utils/cloud-config';
import { S3_SCRIPT } from './s3-script';

/** What the script reads from `/etc/builder.env`. */
export interface BuilderValues {
  SHA: string;
  REPO: string;
  REGION: string;
  PROJECT: string;
  REGISTRY_HOST: string;
  DIAG_BUCKET: string;
  FRONTEND_BUCKET: string;
  BUNDLE_ID: string;
  BOOT_AK: string;
  BOOT_SK: string;
  NODE_IMAGE: string;
  /** The build epoch (`buildEpoch`): marks this build's images and frontend files as made under the current builder key. */
  EPOCH: string;
}

/** Where the builder reports, in the boot-diagnostics bucket: `step`, `log` and `result` (`ok` or `failed`). */
export function builderReportPrefix(sha: string): string {
  return `boot-diag/builder/${sha}/`;
}

/**
 * The script. Written with String.raw: every backslash reaches bash as it stands, and no dollar-brace may appear. Keys are never echoed,
 * and the log it uploads is the script's own output.
 */
export const BUILDER_SCRIPT = String.raw`#!/bin/bash
set -a; . /etc/builder.env; set +a
export HOME=/root GIT_TERMINAL_PROMPT=0
LOG=/var/log/builder.log
exec >>"$LOG" 2>&1
# Object Storage writes go through /etc/builder-s3.mjs in the node image: the machine image's curl may not sign them.
put() {
  docker run --rm -e REGION -e S3_AK="$BOOT_AK@$PROJECT" -e S3_SK="$BOOT_SK" -v /etc/builder-s3.mjs:/s3.mjs:ro -v /run:/run:ro "$NODE_IMAGE" \
    node /s3.mjs put "$DIAG_BUCKET" "boot-diag/builder/$SHA/$1" "$2" 'text/plain; charset=utf-8'
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
trap 'echo "failed at line $LINENO"; finish failed' ERR
set -eE -o pipefail

docker pull -q "$NODE_IMAGE"
# No container reaches the metadata service: the machine's user data holds the boot key.
iptables -I DOCKER-USER -d 169.254.42.42 -j DROP || iptables -I FORWARD -d 169.254.42.42 -j DROP
step key
# Read once: a second read fails, as the bundle is disabled after the first.
curl -sS -m 30 --fail -H "X-Auth-Token: $BOOT_SK" "https://api.scaleway.com/secret-manager/v1beta1/regions/$REGION/secrets/$BUNDLE_ID/versions/latest/access" > /run/builder.bundle
python3 -c 'import base64,json; b=json.loads(base64.b64decode(json.load(open("/run/builder.bundle"))["data"])); open("/run/builder.ak","w").write(b["accessKey"]); open("/run/builder.sk","w").write(b["secretKey"]); open("/run/builder.repo","w").write(b.get("repositoryKey",""))'
rm -f /run/builder.bundle
chmod 600 /run/builder.ak /run/builder.sk /run/builder.repo
BUILDER_AK=$(cat /run/builder.ak)
BUILDER_SK=$(cat /run/builder.sk)

step clone
git init -q /build
git -C /build remote add origin "$REPO"
# A private repository's read key (D19) goes with this one fetch as a header: it is in no URL, no remote and no file the build sees.
if [ -s /run/builder.repo ]; then
  git -C /build -c http.extraHeader="Authorization: Basic $(printf 'x-access-token:%s' "$(cat /run/builder.repo)" | base64 -w0)" fetch -q --depth 1 origin "$SHA"
else
  git -C /build fetch -q --depth 1 origin "$SHA"
fi
rm -f /run/builder.repo
git -C /build checkout -q FETCH_HEAD

printf '%s' "$BUILDER_SK" | docker login "$REGISTRY_HOST" -u nologin --password-stdin
# A BuildKit container: the docker driver writes no layer cache to a registry.
docker buildx create --use --name release --driver docker-container >/dev/null

step build
# The frontend builds on a copy made before anything runs: the app's dependencies reach neither the images' source nor the boot bundle.
if [ -n "$FRONTEND_BUCKET" ]; then cp -a /build /frontend; fi
docker buildx bake --file /etc/builder-bake.json --push services &
SERVICES=$!
# Keyless containers: the engine's workspace builds the boot bundle in the checkout, the app's the frontend in its copy.
docker run --rm -v /build:/build -v /etc/builder-boot.sh:/script.sh:ro -w /build "$NODE_IMAGE" bash -eo pipefail /script.sh
docker buildx bake --file /etc/builder-bake.json --push boot &
BOOT=$!
if [ -n "$FRONTEND_BUCKET" ]; then
  docker run --rm -v /frontend:/build -v /etc/builder-frontend.sh:/script.sh:ro -w /build --env-file /etc/builder-frontend.env "$NODE_IMAGE" bash -eo pipefail /script.sh
fi
wait "$SERVICES"
wait "$BOOT"
docker logout "$REGISTRY_HOST"

if [ -n "$FRONTEND_BUCKET" ]; then
  step files
  # The engine's own code lists the files from the read-only output, holding no key; the upload refuses a row outside that output.
  docker run --rm -v /build:/build:ro -v /frontend/frontend/dist:/dist:ro -w /build/infra "$NODE_IMAGE" \
    node_modules/.bin/tsx tasks/release-files.ts --dist /dist --sha "$SHA" --bucket-url "https://$FRONTEND_BUCKET.s3.$REGION.scw.cloud" > /run/release-files
  printf '%s' "$EPOCH" > /run/builder.epoch
  docker run --rm -e REGION -e S3_AK="$BUILDER_AK@$PROJECT" -e S3_SK="$BUILDER_SK" -v /etc/builder-s3.mjs:/s3.mjs:ro -v /frontend/frontend/dist:/dist:ro \
    -v /run:/run:ro "$NODE_IMAGE" sh -c 'node /s3.mjs upload "$0" /run/release-files /dist "releases/$1/" && node /s3.mjs put "$0" "releases/$1/epoch" /run/builder.epoch' \
    "$FRONTEND_BUCKET" "$SHA"
fi

finish ok
`;

/** The keyless container that builds the boot bundle: the engine's workspace only. */
export function bootBundleScript(pnpmVersion: string): string {
  return [
    `npm install -g --silent pnpm@${pnpmVersion}`,
    "pnpm install --frozen-lockfile --filter 'infra...'",
    'pnpm --filter infra boot:build',
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
 * The builder machine's cloud-init: the values, the bake file, the commands of its keyless containers, the script, and a unit started once.
 * The script runs on Scaleway's `docker` image: it takes the builder key from its read-once bundle with the boot key, fetches the release's
 * commit (with the repository read key the bundle carries for a private repository), builds the boot bundle and the frontend in `node`
 * containers that hold no key, then pushes the images and uploads the frontend files with the builder key, and reports each step to the
 * boot-diagnostics bucket with the boot key.
 */
export function builderCloudConfig(opts: {
  values: BuilderValues;
  frontendEnv: Record<string, string>;
  bake: unknown;
  boot: string;
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
      path: '/etc/builder-frontend.env',
      permissions: '0644',
      content: Object.entries(opts.frontendEnv)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n'),
    },
    { path: '/etc/builder-bake.json', permissions: '0644', content: JSON.stringify(opts.bake, null, 2) },
    { path: '/etc/builder-boot.sh', permissions: '0644', content: opts.boot.trimEnd() },
    { path: '/etc/builder-frontend.sh', permissions: '0644', content: opts.frontend.trimEnd() },
    { path: '/etc/builder-s3.mjs', permissions: '0644', content: S3_SCRIPT.trimEnd() },
    { path: '/usr/local/bin/builder.sh', permissions: '0755', content: BUILDER_SCRIPT.trimEnd() },
    { path: '/etc/systemd/system/builder.service', permissions: '0644', content: UNIT },
  ];
  return cloudConfigDocument(files, ['systemctl daemon-reload', 'systemctl start --no-block builder.service']);
}
