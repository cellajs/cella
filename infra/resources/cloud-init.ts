/**
 * Cloud-init renderer — the per-VM boot script, as a pure function.
 *
 * Extracted from compute.ts so the boot logic (the part with real branching:
 * pull-retry, reconciler-before-fallback ordering, secret scrubbing, the
 * frontend-excludes-secrets rule) can be unit-tested without a Pulumi runtime.
 * compute.ts resolves the Pulumi Outputs in an `.apply()` and hands the plain
 * strings here; the template itself never touches pulumi.
 *
 * Keep this byte-for-byte equivalent to what shipped inline — the VM only runs
 * cloud-init on first boot, and any change triggers a full VM replacement
 * (replaceOnChanges: ['cloudInit']).
 */

export interface CloudInitParams {
  /** Service name (backend, cdc, yjs, ai, frontend). */
  service: string
  /**
   * Compose service to boot in the S3 fallback path. Equals `service` for the
   * in-place services; for the blue-green backend it is the initial active slot
   * (`backend-blue`) so the fallback brings up the slot the ingress points at.
   */
  bootService: string
  /** Docker compose profile to bring up. */
  profile: string
  /** Fully-resolved static .env body written to /opt/app/.env. */
  envFileContent: string
  /** JSON manifest describing which Secret Manager objects this VM should hydrate. */
  runtimeSecretsManifest: string
  /** Resolved reconciler env file written to /etc/reconciler/reconciler.env. */
  reconcilerEnvFile: string
  /** Snippet that installs the reconciler binary + systemd units. */
  installReconcilerSnippet: string
  /** compose.yml body written to /opt/app/compose.yml. */
  composeContent: string
  /** ingress.Caddyfile body written to /opt/app/ingress.Caddyfile. */
  ingressContent: string
  /** Registry endpoint (`<host>/<namespace>`); login uses the host part. */
  registry: string
  /** Scaleway secret key — registry password + S3 boot-diag uploads. */
  secretKey: string
  /** Scaleway access key — S3 boot-diag uploads. */
  accessKey: string
  /** Pulumi state bucket holding boot-diag/ objects. */
  stateBucket: string
  /** Scaleway region for the S3 endpoint. */
  region: string
}

/** Render the first-boot cloud-init script for a single service VM. */
export function renderCloudInit(p: CloudInitParams): string {
  const { service, profile, envFileContent, runtimeSecretsManifest, reconcilerEnvFile, installReconcilerSnippet, composeContent, ingressContent, registry, secretKey, accessKey, stateBucket, region } = p
  const s3Endpoint = `https://s3.${region}.scw.cloud`
  const bootService = p.bootService
  return `#!/bin/bash
set -uo pipefail
# NOTE: intentionally no -e — we want stage markers to always upload so we
# can pinpoint which step failed. Each command uses || true where needed.

# -----------------------------------------------------------------------
# Stage markers: upload tiny files to S3 at each milestone, so even if the
# whole script aborts we can see how far it got.
# -----------------------------------------------------------------------
export AWS_ACCESS_KEY_ID='${accessKey}'
export AWS_SECRET_ACCESS_KEY='${secretKey}'
mark() {
  local tag="$1"
  local ts=$(date -u +%Y%m%dT%H%M%SZ)
  if command -v aws >/dev/null 2>&1; then
    echo "$tag at $ts on $(hostname)" \
      | aws --endpoint-url '${s3Endpoint}' s3 cp - \
        "s3://${stateBucket}/boot-diag/${service}-stage-$tag-$ts.txt" 2>&1 \
      | tee -a /var/log/mark.log || true
  else
    echo "$tag at $ts (aws missing)" >> /var/log/mark.log
  fi
}

# Stage 00 — install awscli first so we can mark every subsequent stage.
# Ubuntu 24.04 (Noble) no longer ships the 'awscli' apt package, so install
# the official AWS CLI v2 bundle. Falls back to pip if curl/unzip fails.
apt-get update -qq 2>&1 | tail -5
apt-get install -y -qq curl unzip ca-certificates 2>&1 | tail -5
if ! command -v aws >/dev/null 2>&1; then
  # Pin AWS CLI v2 to an IMMUTABLE versioned artifact and verify its SHA-256
  # before executing the installer. The unversioned "latest" URL is a moving
  # target a CDN or on-path (MITM) compromise could swap; pin + checksum closes
  # that supply-chain hole — the installer runs as root on first boot, before
  # any app secret is on disk. On mismatch we fall through to the pip path
  # (awscli v1 from PyPI over TLS) rather than executing an unverified bundle.
  AWSCLI_VERSION=2.22.35
  AWSCLI_SHA256=8119ccf67de875f39d386abea986738fa710be57e20d4df66fa99c7f7fd09997
  TMPD=$(mktemp -d)
  if curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64-$AWSCLI_VERSION.zip" -o "$TMPD/awscliv2.zip" \
     && echo "$AWSCLI_SHA256  $TMPD/awscliv2.zip" | sha256sum -c - \
     && unzip -q "$TMPD/awscliv2.zip" -d "$TMPD" \
     && "$TMPD/aws/install" >/dev/null 2>&1; then
    echo "awscli v2 $AWSCLI_VERSION installed via official bundle (sha256 verified)"
  else
    apt-get install -y -qq python3-pip 2>&1 | tail -3
    pip3 install --quiet --break-system-packages awscli 2>&1 | tail -3 || true
  fi
fi
mark 00-started

# -----------------------------------------------------------------------
# Boot diagnostics — write snapshot script + schedule via systemd-run.
# -----------------------------------------------------------------------
mkdir -p /opt/diag
cat > /opt/diag/boot-diag.sh <<'DIAG_EOF'
#!/bin/bash
LOG=/tmp/boot-diag.log
{
  echo "=== uname / uptime ==="
  uname -a; uptime
  echo
  echo "=== cloud-init status ==="
  cloud-init status --long 2>&1 || true
  echo
  echo "=== cloud-init-output.log (tail 500) ==="
  tail -500 /var/log/cloud-init-output.log 2>/dev/null || echo "(missing)"
  echo
  echo "=== mark.log ==="
  cat /var/log/mark.log 2>/dev/null || echo "(no marks)"
  echo
  echo "=== docker ps -a ==="
  docker ps -a 2>&1 || echo "(docker missing)"
  echo
  echo "=== docker compose ps ==="
  (cd /opt/app 2>/dev/null && docker compose --profile ${profile} ps) 2>&1 || echo "(no compose)"
  echo
  echo "=== docker compose logs (tail 500) ==="
  (cd /opt/app 2>/dev/null && docker compose --profile ${profile} logs --no-color --tail=500) 2>&1 || echo "(no logs)"
} > "$LOG" 2>&1

AWS_ACCESS_KEY_ID='${accessKey}' AWS_SECRET_ACCESS_KEY='${secretKey}' \
  aws --endpoint-url '${s3Endpoint}' s3 cp "$LOG" \
  "s3://${stateBucket}/boot-diag/${service}-$(date -u +%Y%m%dT%H%M%SZ).log" 2>&1 || true
DIAG_EOF
chmod +x /opt/diag/boot-diag.sh
systemd-run --on-active=180 --unit=boot-diag-${service} /opt/diag/boot-diag.sh 2>&1 | tail -5
mark 05-diag-scheduled

# Install Docker from official repo (Ubuntu repos lack docker-compose-plugin)
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list
apt-get update -qq 2>&1 | tail -5
apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin 2>&1 | tail -5
systemctl enable --now docker
mark 10-docker-installed

# App directory
mkdir -p /opt/app
mkdir -p /etc/runtime-secrets

# Write compose file
cat > /opt/app/compose.yml <<'COMPOSE_EOF'
${composeContent}
COMPOSE_EOF

# Write ingress reverse-proxy config (held in front of the app container so
# rollovers don't drop the LB-facing host listener).
cat > /opt/app/ingress.Caddyfile <<'INGRESS_EOF'
${ingressContent}
INGRESS_EOF

# Write environment
cat > /opt/app/.env <<'ENV_EOF'
${envFileContent}
ENV_EOF
chmod 600 /opt/app/.env

# Write the runtime secret manifest (metadata only, never secret values).
cat > /etc/runtime-secrets/manifest.json <<'RUNTIME_SECRETS_EOF'
${runtimeSecretsManifest}
RUNTIME_SECRETS_EOF
chmod 600 /etc/runtime-secrets/manifest.json
mark 20-files-written

# Login to container registry
echo '${secretKey}' | docker login ${registry.split('/')[0]} -u nologin --password-stdin
mark 30-registry-login

# -----------------------------------------------------------------------
# Reconciler install — happens BEFORE first compose up so the reconciler
# itself drives the boot. The reconciler reads the desired tag from S3 and
# is the SOLE source of the running image version; no tag is baked into this
# script, so a routine release never changes cloud-init and never replaces
# the VM. On bootstrap (no release pushed yet) the reconciler exits 0 without
# starting the app container, and the loop below simply waits for CI to write
# the first real SHA.
# -----------------------------------------------------------------------
mkdir -p /etc/reconciler /var/lib/reconciler /var/log/reconciler
cat > /etc/reconciler/reconciler.env <<'RECON_ENV_EOF'
${reconcilerEnvFile}
RECON_ENV_EOF
chmod 0600 /etc/reconciler/reconciler.env

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
RECONCILER_ENV_PATH = pathlib.Path('/etc/reconciler/reconciler.env')


def read_env_file(path: pathlib.Path) -> dict[str, str]:
  values: dict[str, str] = {}
  if not path.exists():
    return values
  for raw_line in path.read_text(encoding='utf-8').splitlines():
    line = raw_line.strip()
    if not line or line.startswith('#') or '=' not in line:
      continue
    key, value = line.split('=', 1)
    values[key] = value.strip().strip("'").strip('"')
  return values


def main() -> int:
  manifest = json.loads(MANIFEST_PATH.read_text(encoding='utf-8'))
  reconciler_env = read_env_file(RECONCILER_ENV_PATH)
  token = os.environ.get('SCW_SECRET_KEY') or os.environ.get('AWS_SECRET_ACCESS_KEY') or reconciler_env.get('AWS_SECRET_ACCESS_KEY')
  region = os.environ.get('SCW_REGION') or os.environ.get('REGION') or reconciler_env.get('REGION')
  if not token or not region:
    print('runtime-secret-sync: missing Secret Manager credentials or region', file=sys.stderr)
    return 1

  lines: list[str] = []
  errors: list[str] = []
  for entry in manifest:
    # The access URL already carries the region in its path, so use ONLY the
    # bare uuid. Pulumi's scaleway Secret id is the composite region/uuid; a
    # region-prefixed id here yields secrets/<region>/<uuid> in the path -> 404.
    secret_id = str(entry['secretId']).rsplit('/', 1)[-1]
    request = urllib.request.Request(
      f'https://api.scaleway.com/secret-manager/v1beta1/regions/{region}/secrets/{secret_id}/versions/latest/access',
      headers={
        'Content-Type': 'application/json',
        'X-Auth-Token': token,
      },
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

${installReconcilerSnippet}
mark 40-reconciler-installed

# Hydrate runtime secrets from Secret Manager into /opt/app/.env.runtime, and
# REMEMBER whether it succeeded. A failure means this VM's IAM key cannot decrypt
# the required secrets (the exact fault that took prod down). An app booted
# without its runtime secrets only fails env validation and crash-loops behind a
# 502, hiding the real cause — so a failed sync must block the app from booting,
# not mask itself. The reconciler enforces this on every 20s tick (it die's
# before rolling); the first-boot fallback below honours the same gate.
RUNTIME_SECRETS_OK=0
if /usr/local/bin/runtime-secret-sync; then
  RUNTIME_SECRETS_OK=1
  mark 42-runtime-secrets-synced
else
  mark 42-runtime-secrets-FAILED
fi

# Bring up the ingress proxy first so the host port is served before any app
# container exists. The reconciler then rolls only the app (up -d --no-deps),
# leaving this proxy running so the LB backend never goes down on deploys.
cd /opt/app
docker compose --profile ${profile} up -d ingress 2>&1 | tail -10
mark 45-ingress-up

# First boot: run the reconciler once to pull + roll the currently-published
# release. We don't trust its exit code:
#   - Fresh stack (no release pushed yet, so S3 has no tag object): it exits 0
#     without booting anything — we fall through to the fallback, which also
#     no-ops when the tag is absent, and the systemd timer (every 20s) converges
#     once CI writes the first real SHA.
#   - VM replacement (S3 already holds a real SHA): it pulls + rolls and records
#     /var/lib/reconciler/current.tag. But its health-gated rollback targets the
#     *previous* tag, which on a fresh replacement is empty — so a momentarily
#     unhappy probe can leave the VM with NO container.
# So a non-empty current.tag is our "app is up" signal; if it's missing we boot
# the last-good tag directly from S3 below rather than sit empty behind the LB.
/usr/local/bin/reconciler || true
if [[ -s /var/lib/reconciler/current.tag ]]; then
  mark 50-reconciler-booted
else
  # Resilience fallback — boot the last-good published tag straight from S3 with
  # a plain (non-health-gated) compose up. A running last-known-good container
  # behind the LB always beats an empty VM; the systemd timer still converges to
  # the desired SHA and re-applies health-gated rollback for any later deploy
  # (where a real previous tag exists to roll back to). The tag is read in a
  # subshell so sourcing the reconciler env (which carries its own scoped S3
  # creds) doesn't clobber the boot-diag credentials used by mark(). An ABSENT
  # tag object (no release yet) yields an empty value here → awaiting-first-
  # deploy; a real fetch error likewise boots nothing and lets the timer surface
  # it on its next tick.
  fallback_tag=$(
    set -a; . /etc/reconciler/reconciler.env; set +a
    aws --endpoint-url '${s3Endpoint}' s3 cp "s3://\${TAG_BUCKET}/\${TAG_KEY}" - 2>/dev/null | tr -d '[:space:]'
  )
  if [[ -n "$fallback_tag" && "$RUNTIME_SECRETS_OK" != "1" ]]; then
    # A release IS published, but we could not hydrate the required runtime
    # secrets (IAM grant missing/insufficient — the prod-down fault). Deliberately
    # do NOT boot the app: a secret-less container only crash-loops behind a 502,
    # masking the cause and never self-correcting. Leaving the box app-less keeps
    # the LB backend unhealthy (clearly DOWN, not silently 502ing), and the 20s
    # reconciler timer boots it the moment the grant is restored. Pulumi now
    # manages that grant (infra/resources/vm-iam.ts) so this should never trip in
    # practice — it is the loud, self-healing floor under that guarantee.
    mark 50-secrets-unavailable-app-not-booted
  elif [[ -n "$fallback_tag" ]]; then
    export ${service.toUpperCase()}_TAG="$fallback_tag"
    cd /opt/app
    PULL_OK=0
    for i in $(seq 1 12); do
      if docker compose --profile ${profile} pull ${bootService} 2>&1 | tail -5; then
        PULL_OK=1; break
      fi
      echo "fallback pull attempt $i failed, retrying in 10s..."
      sleep 10
    done
    if docker compose --profile ${profile} up -d --no-deps ${bootService} 2>&1 | tail -10; then
      printf '%s' "$fallback_tag" > /var/lib/reconciler/current.tag
      mark "50-fallback-boot-pull=$([ $PULL_OK = 1 ] && echo ok || echo failed)"
    else
      mark 50-fallback-compose-up-failed
    fi
  else
    mark 50-awaiting-first-deploy
  fi
fi

# Scrub secrets from cloud-init logs
sed -i '/SECRET\\|PASSWORD\\|API_KEY\\|DATABASE_URL\\|docker login/Id' /var/log/cloud-init-output.log 2>/dev/null || true
sed -i '/SECRET\\|PASSWORD\\|API_KEY\\|DATABASE_URL\\|docker login/Id' /var/log/cloud-init.log 2>/dev/null || true
`
}
