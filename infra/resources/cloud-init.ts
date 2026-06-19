/**
 * Cloud-init renderer — the per-VM boot script for one immutable generation.
 *
 * Extracted from compute.ts so the boot logic can be unit-tested without a
 * Pulumi runtime. compute.ts resolves the Pulumi Outputs in an `.apply()` and
 * hands the plain strings here; the template itself never touches pulumi.
 *
 * Immutable-node model: the image SHA is baked into the compose `.env`
 * (`<SVC>_TAG`), so this VM pulls exactly that release at first boot. There is
 * no background deploy agent and no out-of-band tag or manifest channel — the
 * generation IS the release. A service that opts into
 * `runMigrate` runs its one-shot `migrate` companion (gated on exit 0) BEFORE
 * the app starts, so the schema is expanded before the new generation is served.
 *
 * The app container binds the host port directly; the LB health-checks the app's
 * own `/health`. A failed boot leaves the VM alive for serial-console inspection
 * (CI sees the failure inline via the version health check, so no S3 diagnostics
 * channel is needed).
 */

export interface CloudInitParams {
  /** Service name (backend, cdc, yjs, ai, frontend). */
  service: string
  /** Docker compose profile to bring up (equals the service slug). */
  profile: string
  /** Run the one-shot `migrate` companion before the app (expand-before-cutover). */
  runMigrate: boolean
  /** Release SHA baked into this generation (also the compose image tag). */
  releaseSha: string
  /** Fully-resolved static .env body written to /opt/app/.env (includes `<SVC>_TAG`). */
  envFileContent: string
  /** Runtime secret manifest JSON (metadata only) written to /etc/runtime-secrets/manifest.json. */
  manifestContent: string
  /** compose.yml body written to /opt/app/compose.yml. */
  composeContent: string
  /** Registry endpoint (`<host>/<namespace>`); login uses the host part. */
  registry: string
  /** Scaleway secret key — registry password + Secret Manager access token. */
  secretKey: string
  /** Scaleway region for the Secret Manager endpoint. */
  region: string
  /** Whether the selected VM image already includes Docker Engine + compose plugin. */
  dockerPreinstalled: boolean
}

const writeHeredoc = (path: string, marker: string, content: string): string => `cat > ${path} <<'${marker}'
${content}
${marker}`

const bootReplayUnit = `[Unit]
Description=Replay the cella first-boot log to the serial console
After=multi-user.target
[Service]
Type=oneshot
ExecStart=/bin/sh -c 'echo "::cella:: ===== replay of first-boot log ====="; cat /var/log/cella-boot.log 2>/dev/null > /dev/console; echo "::cella:: ===== end replay (live container logs: docker logs) ====="'
[Install]
WantedBy=multi-user.target`

export const runtimeSecretSyncScript = `#!/usr/bin/env python3
import base64
import json
import os
import pathlib
import sys
import urllib.error
import urllib.request

MANIFEST_PATH = pathlib.Path('/etc/runtime-secrets/manifest.json')
RUNTIME_ENV_PATH = pathlib.Path('/opt/app/.env.runtime')


def main() -> int:
  manifest = json.loads(MANIFEST_PATH.read_text(encoding='utf-8'))
  token = os.environ.get('SCW_SECRET_KEY')
  region = os.environ.get('SCW_REGION')
  if not token or not region:
    print('runtime-secret-sync: missing Secret Manager credentials or region', file=sys.stderr)
    return 1

  lines: list[str] = []
  errors: list[str] = []
  for entry in manifest:
    # The access URL already carries the region in its path, so use ONLY the
    # bare uuid. A region-prefixed id yields secrets/<region>/<uuid> -> 404.
    secret_id = str(entry['secretId']).rsplit('/', 1)[-1]
    request = urllib.request.Request(
      f'https://api.scaleway.com/secret-manager/v1beta1/regions/{region}/secrets/{secret_id}/versions/latest/access',
      headers={'Content-Type': 'application/json', 'X-Auth-Token': token},
      method='GET',
    )
    try:
      with urllib.request.urlopen(request) as response:
        payload = json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as exc:
      if entry['required']:
        errors.append(f'{entry["envVar"]}: {exc.code}')
      continue

    value = base64.b64decode(payload['data']).decode('utf-8')
    if chr(10) in value or chr(13) in value:
      errors.append(f'{entry["envVar"]}: multiline values are not supported in env files')
      continue
    lines.append(f'{entry["envVar"]}={value}')

  if errors:
    print('runtime-secret-sync: failed to hydrate required runtime secrets', file=sys.stderr)
    for error in errors:
      print(error, file=sys.stderr)
    return 1

  payload = chr(10).join(lines)
  if payload:
    payload += chr(10)
  RUNTIME_ENV_PATH.write_text(payload, encoding='utf-8')
  os.chmod(RUNTIME_ENV_PATH, 0o600)
  return 0


if __name__ == '__main__':
  raise SystemExit(main())`

const bootHeader = (service: string, releaseSha: string): string => `#!/bin/bash
# Mirror ALL boot output to the serial console (and a local log) so a no-SSH VM
# can be debugged live — this is the boot-diagnostic channel for a box with no
# inbound access. Open the Scaleway serial console to watch '::cella::' markers.
exec > >(tee -a /var/log/cella-boot.log 2>/dev/null > /dev/console) 2>&1
set -uo pipefail
say() { echo "::cella:: $*" ; }
# Make the final status unmistakable on the serial console even if a step exits
# non-zero somewhere unexpected (set -e is intentionally NOT used so we control
# the gates explicitly, but this trap catches any stray failure).
trap 'rc=$?; if [ "$rc" -ne 0 ]; then say "BOOT FAILED (exit $rc) — see the last ::cella:: step above"; fi' EXIT
say "boot start — service=${service} release=${releaseSha}"`

const installBootReplayService = (): string => `# Install a boot-log replay service so a REBOOT re-prints the captured boot log
# to the serial console (cloud-init's user-script only runs on first boot, so
# this is the only way to re-read it on a no-SSH box). Watch for '::cella::'.
${writeHeredoc('/etc/systemd/system/cella-boot-replay.service', 'REPLAY_UNIT_EOF', bootReplayUnit)}
systemctl enable cella-boot-replay.service 2>&1 | tail -1`

const waitForPrivateNetwork = (): string => `# Wait for the private-network NIC (database lives on the private network). The
# Scaleway scw-vpc-iface service brings up the second NIC asynchronously, so the
# app/migrate must not race it. Fail loudly to the console if it never appears.
say "waiting for private-network NIC + default route"
for i in $(seq 1 30); do
  if ip route get 10.0.0.1 >/dev/null 2>&1 && ip -4 addr show | grep -q "10\\.0\\."; then
    say "private network up: $(ip -4 -o addr show | grep '10\\.0\\.' | awk '{print $2, $4}')"
    break
  fi
  say "private network not ready (attempt $i/30), sleeping 5s"
  sleep 5
done`

const installDocker = (): string => `# Install Docker from the official repo (Ubuntu repos lack docker-compose-plugin).
say "installing docker"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq 2>&1 | tail -5
apt-get install -y -qq curl ca-certificates 2>&1 | tail -5
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list
apt-get update -qq 2>&1 | tail -5
apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin 2>&1 | tail -5
systemctl enable --now docker
say "docker installed"`

const writeAppFiles = (composeContent: string, envFileContent: string, manifestContent: string): string => `# App directory + runtime-secret staging.
mkdir -p /opt/app /etc/runtime-secrets

# Write the compose file.
${writeHeredoc('/opt/app/compose.yml', 'COMPOSE_EOF', composeContent)}

# Write the static environment (includes the baked image tag <SVC>_TAG=<sha>,
# which docker compose reads to pull exactly this release).
${writeHeredoc('/opt/app/.env', 'ENV_EOF', envFileContent)}
chmod 600 /opt/app/.env

# Write the runtime secret manifest (metadata only — secret IDs + env var names,
# never values). Baked into cloud-init: under immutable releases every change
# replaces the VM anyway, so there is no reason to deliver it out-of-band.
${writeHeredoc('/etc/runtime-secrets/manifest.json', 'MANIFEST_EOF', manifestContent)}
chmod 600 /etc/runtime-secrets/manifest.json`

const loginToRegistry = (registryHost: string, secretKey: string): string => `# Login to the container registry.
say "docker login ${registryHost}"
echo '${secretKey}' | docker login ${registryHost} -u nologin --password-stdin`

const installRuntimeSecretSync = (): string => `# Runtime secret sync — hydrate /opt/app/.env.runtime from Secret Manager. A
# required secret that cannot be hydrated (IAM grant missing/insufficient) fails
# the boot rather than letting a secret-less container crash-loop behind a 502.
${writeHeredoc('/usr/local/bin/runtime-secret-sync', 'RUNTIME_SECRET_SYNC_EOF', runtimeSecretSyncScript)}
chmod 0755 /usr/local/bin/runtime-secret-sync`

const runRuntimeSecretSync = (secretKey: string, region: string): string => `say "running runtime-secret-sync"
if ! SCW_SECRET_KEY='${secretKey}' SCW_REGION='${region}' /usr/local/bin/runtime-secret-sync; then
  say "FAIL: runtime-secret-sync — required secrets unavailable; not starting the app"
  exit 1
fi
say "runtime secrets hydrated"`

const pullImage = (profile: string): string => `cd /opt/app

# Pull the pinned image, retrying through transient registry blips.
say "pulling image ${profile}"
for i in $(seq 1 12); do
  if docker compose --profile ${profile} pull ${profile} 2>&1 | tail -5; then
    break
  fi
  say "pull attempt $i/12 failed, retrying in 10s"
  sleep 10
done`

const migrateStep = (profile: string, enabled: boolean): string => enabled
  ? `# Expand-migrate — run the one-shot migrate companion BEFORE the app starts.
# Migrations are additive (expand-before-cutover), so the previous generation
# keeps serving the old schema until the cutover re-points the LB. A failed
# migrate means this generation never goes healthy, so the cutover aborts and
# the previous generation is left untouched. The migrate companion verifies the
# DB TLS chain in-process and logs the underlying pg error (error.cause) on
# failure, so a failed migrate is diagnosable from this serial console alone.
echo "running one-shot migrate companion..."
say "running one-shot migrate companion"
if ! docker compose --profile ${profile} run --rm migrate; then
  say "FAIL: migrate companion failed — not starting the app"
  exit 1
fi
say "migrate complete"`
  : ''

const startApp = (profile: string): string => `# Start the app container (binds the host port; the LB health-checks /health).
say "starting app container ${profile}"
docker compose --profile ${profile} up -d ${profile} 2>&1 | tail -10
say "boot complete — ${profile} started; verify /health on port"`

const scrubCloudInitLogs = (): string => `# Scrub secrets from cloud-init logs.
sed -i '/SECRET\\|PASSWORD\\|API_KEY\\|DATABASE_URL\\|docker login/Id' /var/log/cloud-init-output.log 2>/dev/null || true
sed -i '/SECRET\\|PASSWORD\\|API_KEY\\|DATABASE_URL\\|docker login/Id' /var/log/cloud-init.log 2>/dev/null || true`

/** Render the first-boot cloud-init script for a single service generation VM. */
export function renderCloudInit(p: CloudInitParams): string {
  const registryHost = p.registry.split('/')[0]
  return [
    bootHeader(p.service, p.releaseSha),
    installBootReplayService(),
    waitForPrivateNetwork(),
    p.dockerPreinstalled ? '' : installDocker(),
    writeAppFiles(p.composeContent, p.envFileContent, p.manifestContent),
    loginToRegistry(registryHost, p.secretKey),
    installRuntimeSecretSync(),
    runRuntimeSecretSync(p.secretKey, p.region),
    pullImage(p.profile),
    migrateStep(p.profile, p.runMigrate),
    startApp(p.profile),
    scrubCloudInitLogs(),
  ].filter(Boolean).join('\n\n') + '\n'
}
