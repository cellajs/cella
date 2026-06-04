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
  /** Fully-resolved .env body (compose env vars + secrets) written to /opt/app/.env. */
  envFileContent: string
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
  const { service, profile, envFileContent, reconcilerEnvFile, installReconcilerSnippet, composeContent, ingressContent, registry, secretKey, accessKey, stateBucket, region } = p
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
  TMPD=$(mktemp -d)
  if curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "$TMPD/awscliv2.zip" \
     && unzip -q "$TMPD/awscliv2.zip" -d "$TMPD" \
     && "$TMPD/aws/install" >/dev/null 2>&1; then
    echo "awscli v2 installed via official bundle"
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

${installReconcilerSnippet}
mark 40-reconciler-installed

# Bring up the ingress proxy first so the host port is served before any app
# container exists. The reconciler then rolls only the app (up -d --no-deps),
# leaving this proxy running so the LB backend never goes down on deploys.
cd /opt/app
docker compose --profile ${profile} up -d ingress 2>&1 | tail -10
mark 45-ingress-up

# First boot: run the reconciler once to pull + roll the currently-published
# release. We don't trust its exit code:
#   - Fresh stack (S3 still holds the 'bootstrap' placeholder): it exits 0
#     without booting anything — we fall through to the fallback, which also
#     no-ops on 'bootstrap', and the systemd timer (every 20s) converges once
#     CI writes the first real SHA.
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
  # creds) doesn't clobber the boot-diag credentials used by mark().
  fallback_tag=$(
    set -a; . /etc/reconciler/reconciler.env; set +a
    aws --endpoint-url '${s3Endpoint}' s3 cp "s3://\${TAG_BUCKET}/\${TAG_KEY}" - 2>/dev/null | tr -d '[:space:]'
  )
  if [[ -n "$fallback_tag" && "$fallback_tag" != "bootstrap" ]]; then
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
