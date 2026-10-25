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
# The services' images bake while the keyless container builds the boot bundle and the frontend; only the boot image waits for its bundle.
docker buildx bake --file /etc/builder-bake.json --push services &
BAKE=$!
# The app's dependencies run here, in a container that holds no key.
docker run --rm -v /build:/build -v /etc/builder-container.sh:/builder-container.sh:ro -w /build --env-file /etc/builder-frontend.env "$NODE_IMAGE" bash -eo pipefail /builder-container.sh
wait "$BAKE"

step images
docker buildx bake --file /etc/builder-bake.json --push boot
docker logout "$REGISTRY_HOST"

if [ -s /build/.release-files ]; then
  step files
  docker run --rm -e REGION -e S3_AK="$BUILDER_AK@$PROJECT" -e S3_SK="$BUILDER_SK" -v /etc/builder-s3.mjs:/s3.mjs:ro -v /build:/build:ro "$NODE_IMAGE" \
    node /s3.mjs upload "$FRONTEND_BUCKET" /build/.release-files
fi

finish ok
`;

/**
 * The keyless container's commands: install the workspace and build the boot bundle; when there is a frontend, write this environment's
 * OpenAPI spec (the docs page serves it, with the environment's URLs), then build the frontend and its upload list.
 */
export function containerScript(opts: { pnpmVersion: string; sha: string; frontendBucketUrl?: string }): string {
  const lines = [`npm install -g --silent pnpm@${opts.pnpmVersion}`];
  if (opts.frontendBucketUrl) {
    lines.push(
      "pnpm install --frozen-lockfile --filter 'frontend...' --filter 'backend...' --filter 'infra...'",
      'pnpm --filter infra boot:build',
      // The spec opens no database and signs nothing: the example env and a placeholder cookie secret only pass validation.
      'cp backend/.env.example backend/.env',
      'COOKIE_SECRET=openapi-spec-placeholder-secret pnpm --filter backend generate:openapi --force',
      'cp backend/openapi.cache.json sdk/gen/openapi.json',
      'pnpm --filter frontend build',
      `pnpm --silent --filter infra release-files --dist /build/frontend/dist --sha ${opts.sha} --bucket-url ${opts.frontendBucketUrl} > /build/.release-files`,
    );
  } else {
    lines.push("pnpm install --frozen-lockfile --filter 'infra...'", 'pnpm --filter infra boot:build');
  }
  return `${lines.join('\n')}\n`;
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

const indent = (text: string, spaces: number) =>
  text
    .split('\n')
    .map((line) => (line ? ' '.repeat(spaces) + line : ''))
    .join('\n');

/**
 * The builder machine's cloud-init: the values, the bake file, the commands of its keyless container, the script, and a unit started once.
 * The script runs on Scaleway's `docker` image: it takes the builder key from its read-once bundle with the boot key, fetches the release's
 * commit (with the repository read key the bundle carries for a private repository), has a `node` container that holds no key install the workspace and build the boot bundle and the frontend, then pushes the images
 * and uploads the frontend files with the builder key, and reports each step to the boot-diagnostics bucket with the boot key.
 */
export function builderCloudConfig(opts: { values: BuilderValues; frontendEnv: Record<string, string>; bake: unknown; container: string }): string {
  const files = [
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
    { path: '/etc/builder-container.sh', permissions: '0644', content: opts.container.trimEnd() },
    { path: '/etc/builder-s3.mjs', permissions: '0644', content: S3_SCRIPT.trimEnd() },
    { path: '/usr/local/bin/builder.sh', permissions: '0755', content: BUILDER_SCRIPT.trimEnd() },
    { path: '/etc/systemd/system/builder.service', permissions: '0644', content: UNIT },
  ];
  const written = files.flatMap((file) => [
    `  - path: ${file.path}`,
    `    permissions: '${file.permissions}'`,
    '    content: |',
    indent(file.content, 6),
  ]);
  return [
    '#cloud-config',
    'write_files:',
    ...written,
    'runcmd:',
    '  - systemctl daemon-reload',
    '  - systemctl start --no-block builder.service',
    '',
  ].join('\n');
}
