/**
 * Cloud-init renderer — the per-VM boot script for one immutable generation.
 *
 * Extracted from compute.ts so the boot logic can be unit-tested without a
 * Pulumi runtime. compute.ts resolves the Pulumi Outputs in an `.apply()` and
 * hands the plain strings here; the template itself never touches pulumi.
 *
 * Immutable-node model (info/ZERO_DOWNTIME_REPLACEMENT.md): the image SHA is
 * baked into the compose `.env` (`<SVC>_TAG`), so this VM pulls exactly that
 * release at first boot. There is no on-VM reconciler and no out-of-band tag or
 * manifest channel — the generation IS the release. A service that opts into
 * `runMigrate` runs its one-shot `migrate` companion (gated on exit 0) BEFORE
 * the app starts, so the schema is expanded before the cutover re-points the LB.
 *
 * The app container binds the host port directly; the LB health-checks the app's
 * own `/health`. A failed boot leaves the VM alive for serial-console inspection
 * (CI sees the failure inline via the cutover health gate, so no S3 diagnostics
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
  /** Scaleway access key (kept for parity; not used for S3 in this model). */
  accessKey: string
  /** Scaleway region for the Secret Manager endpoint. */
  region: string
}

/** Render the first-boot cloud-init script for a single service generation VM. */
export function renderCloudInit(p: CloudInitParams): string {
  const { service, profile, runMigrate, releaseSha, envFileContent, manifestContent, composeContent, registry, secretKey } = p
  const registryHost = registry.split('/')[0]

  const migrateStep = runMigrate
    ? `# Expand-migrate — run the one-shot migrate companion BEFORE the app starts.
# Migrations are additive (expand-before-cutover), so the previous generation
# keeps serving the old schema until the cutover re-points the LB. A failed
# migrate means this generation never goes healthy, so the cutover aborts and
# the previous generation is left untouched.
# TLS/connectivity probe — the migrate image swallows the underlying pg error
# (it only logs error.message, not error.cause), so verify the DB TLS + host
# from the VM before migrating. openssl tells cert/hostname mismatch apart from
# auth failure: a verify error here = CA/SAN problem (infra fix); a clean verify
# but failing migrate = auth/permission (stale credential secret).
say "db-probe: checking TLS + reachability before migrate"
DBHOST=$(grep -E '^DATABASE_ADMIN_URL=' /opt/app/.env.runtime | head -1 | sed -E 's#^DATABASE_ADMIN_URL=postgres(ql)?://[^@]+@([^:/?]+):[0-9]+/.*#\\2#')
DBPORT=$(grep -E '^DATABASE_ADMIN_URL=' /opt/app/.env.runtime | head -1 | sed -E 's#^DATABASE_ADMIN_URL=postgres(ql)?://[^@]+@[^:/?]+:([0-9]+)/.*#\\2#')
grep -E '^DATABASE_SSL_CA=' /opt/app/.env.runtime | head -1 | sed -E 's#^DATABASE_SSL_CA=##' | base64 -d > /tmp/dbca.pem 2>/dev/null
say "db-probe: host=$DBHOST port=$DBPORT ca_lines=$(wc -l < /tmp/dbca.pem 2>/dev/null)"
if command -v nc >/dev/null 2>&1; then
  if nc -z -w5 "$DBHOST" "$DBPORT" 2>/dev/null; then say "db-probe: tcp reachable"; else say "db-probe: TCP UNREACHABLE"; fi
fi
echo | openssl s_client -connect "$DBHOST:$DBPORT" -CAfile /tmp/dbca.pem -servername "$DBHOST" -starttls postgres -verify_return_error 2>&1 \
  | grep -iE 'verify return code|verify error|subject=|issuer=|Verification' | head -10 | while IFS= read -r l; do say "db-probe: $l"; done
rm -f /tmp/dbca.pem

echo "running one-shot migrate companion..."
say "running one-shot migrate companion"
if ! docker compose --profile ${profile} run --rm migrate; then
  say "FAIL: migrate companion failed \u2014 not starting the app"
  exit 1
fi
say "migrate complete"
`
    : ''

  return `#!/bin/bash
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
say "boot start — service=${service} release=${releaseSha}"

# Install a boot-log replay service so a REBOOT re-prints the captured boot log
# to the serial console (cloud-init's user-script only runs on first boot, so
# this is the only way to re-read it on a no-SSH box). Watch for '::cella::'.
cat > /etc/systemd/system/cella-boot-replay.service <<'REPLAY_UNIT_EOF'
[Unit]
Description=Replay the cella first-boot log to the serial console
After=multi-user.target
[Service]
Type=oneshot
ExecStart=/bin/sh -c 'echo "::cella:: ===== replay of first-boot log ====="; cat /var/log/cella-boot.log 2>/dev/null > /dev/console; echo "::cella:: ===== end replay (live container logs: docker logs) ====="'
[Install]
WantedBy=multi-user.target
REPLAY_UNIT_EOF
systemctl enable cella-boot-replay.service 2>&1 | tail -1

# Wait for the private-network NIC (database lives on the private network). The
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
done

# Install Docker from the official repo (Ubuntu repos lack docker-compose-plugin).
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
say "docker installed"

# App directory + runtime-secret staging.
mkdir -p /opt/app /etc/runtime-secrets

# Write the compose file.
cat > /opt/app/compose.yml <<'COMPOSE_EOF'
${composeContent}
COMPOSE_EOF

# Write the static environment (includes the baked image tag <SVC>_TAG=<sha>,
# which docker compose reads to pull exactly this release).
cat > /opt/app/.env <<'ENV_EOF'
${envFileContent}
ENV_EOF
chmod 600 /opt/app/.env

# Write the runtime secret manifest (metadata only — secret IDs + env var names,
# never values). Baked into cloud-init: under immutable releases every change
# replaces the VM anyway, so there is no reason to deliver it out-of-band.
cat > /etc/runtime-secrets/manifest.json <<'MANIFEST_EOF'
${manifestContent}
MANIFEST_EOF
chmod 600 /etc/runtime-secrets/manifest.json

# Login to the container registry.
say "docker login ${registryHost}"
echo '${secretKey}' | docker login ${registryHost} -u nologin --password-stdin

# Runtime secret sync — hydrate /opt/app/.env.runtime from Secret Manager. A
# required secret that cannot be hydrated (IAM grant missing/insufficient) fails
# the boot rather than letting a secret-less container crash-loop behind a 502.
cat > /usr/local/bin/runtime-secret-sync <<'RUNTIME_SECRET_SYNC_EOF'
#!/usr/bin/env python3
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
  raise SystemExit(main())
RUNTIME_SECRET_SYNC_EOF
chmod 0755 /usr/local/bin/runtime-secret-sync

say "running runtime-secret-sync"
if ! SCW_SECRET_KEY='${secretKey}' SCW_REGION='${p.region}' /usr/local/bin/runtime-secret-sync; then
  say "FAIL: runtime-secret-sync — required secrets unavailable; not starting the app"
  exit 1
fi
say "runtime secrets hydrated"

cd /opt/app

# Pull the pinned image, retrying through transient registry blips.
say "pulling image ${profile}"
for i in $(seq 1 12); do
  if docker compose --profile ${profile} pull ${profile} 2>&1 | tail -5; then
    break
  fi
  say "pull attempt $i/12 failed, retrying in 10s"
  sleep 10
done

${migrateStep}
# Start the app container (binds the host port; the LB health-checks /health).
say "starting app container ${profile}"
docker compose --profile ${profile} up -d ${profile} 2>&1 | tail -10
say "boot complete — ${profile} started; verify /health on port"

# Scrub secrets from cloud-init logs.
sed -i '/SECRET\\|PASSWORD\\|API_KEY\\|DATABASE_URL\\|docker login/Id' /var/log/cloud-init-output.log 2>/dev/null || true
sed -i '/SECRET\\|PASSWORD\\|API_KEY\\|DATABASE_URL\\|docker login/Id' /var/log/cloud-init.log 2>/dev/null || true
`
}
