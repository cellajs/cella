#!/bin/bash
# Reconciler — pull the desired image tag from S3 and roll the local service.
#
# Runs on a systemd timer (every 20s). Reads its target tag from
# s3://<bucket>/deploy/<service>.tag, compares to the digest currently
# running, and if they differ:
#
#   1. ensure the `ingress` proxy is up (holds the host port across rollovers)
#   2. docker compose pull <service> (with retries — registry is the flaky bit)
#   3. docker compose up -d --no-deps <service> (recreate ONLY the app)
#   4. probe /health locally and assert X-App-Version matches the desired tag
#   5. if probe fails: roll back to the previously-running tag and exit non-zero
#
# Zero-downtime: the app container is fronted by an `ingress` Caddy proxy that
# owns the LB-facing host port. Recreating only the app service (`--no-deps`)
# leaves that proxy running, so the LB backend never goes down; ingress retries
# the upstream dial across the brief restart gap. See infra/ingress.Caddyfile.
#
# Everything is keyed off `/etc/reconciler/reconciler.env`, which cloud-init
# writes per-VM with SERVICE, COMPOSE_PROFILE, HEALTH_PORT, TAG_BUCKET,
# TAG_KEY, REGION, REGISTRY. The script itself is service-agnostic so the same
# binary ships to every VM.
#
# Exits:
#   0 — no-op (tag unchanged, or no release published yet) OR successful cutover
#   1 — fatal config error (missing env, missing tools)
#   2 — tag fetch failed for a real reason (S3 unreachable / IAM denied); a
#       MISSING tag object is NOT an error — it exits 0 (no release yet)
#   3 — pull failed after retries
#   4 — compose up failed
#   5 — post-deploy health check failed (rollback may also have failed)
#   6 — expand migration failed (app left untouched, no rollover attempted)
#
# Status channel: every roll publishes its progress/outcome to
# s3://<TAG_BUCKET>/status/<service>.json so CI (wait-for-version) and humans
# can see WHAT the reconciler is doing and WHY a roll failed without SSHing the
# box. On a health failure the failed slot's logs are also pushed to
# s3://<STATE_BUCKET>/boot-diag/<service>-failed-<ts>.log. See publish_status.
#
# Concurrency: a flock on /var/lock/reconciler.lock guarantees one run at a
# time. Overlapping ticks are dropped (the timer's next fire picks up the
# current desired state anyway).
set -uo pipefail

ENV_FILE=${RECONCILER_ENV_FILE:-/etc/reconciler/reconciler.env}
STATE_DIR=${RECONCILER_STATE_DIR:-/var/lib/reconciler}
LOCK_FILE=${RECONCILER_LOCK_FILE:-/var/lock/reconciler.lock}

log() {
  # journald prefixes timestamp + unit; we add only severity + key=value pairs
  # so the output stays grep-friendly. Always to stderr so stdout is reserved
  # for explicit outputs (currently none, but keeps the option open).
  printf '%s reconciler: %s\n' "$1" "$2" >&2
}

die() {
  log ERROR "$2"
  STATUS_DONE=1
  publish_status failed failed "$2" "$1"
  exit "$1"
}

# --- Reconciler status channel ----------------------------------------------
# Broadcast the roll's progress/outcome to s3://<TAG_BUCKET>/status/<svc>.json
# (overwrite) so CI and humans can see what the reconciler is doing and why a
# roll failed without SSHing the box. Best-effort: every write is swallowed so
# an S3 hiccup never breaks an actual roll. Secret-free by construction — only
# controlled identifiers (service, sha, phase, reason) are emitted, never app
# output or env.
#   phase  — pulling|migrating|slot-up|probing|flipping|verifying|draining|done
#   result — rolling (in progress) | ok (cutover committed) | failed (gave up)
publish_status() {
  local phase="$1" result="$2" reason="${3:-}" code="${4:-}" ts
  [[ -n "${TAG_BUCKET:-}" && -n "${S3_ENDPOINT:-}" ]] || return 0
  ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  printf '{"service":"%s","ts":"%s","desired":"%s","current":"%s","phase":"%s","result":"%s","exitCode":"%s","reason":"%s","activeSlot":"%s"}' \
    "${SERVICE:-}" "$ts" "${desired:-}" "${current:-}" "$phase" "$result" "$code" "$reason" "${ACTIVE_SLOT_NAME:-}" \
    | aws --endpoint-url "$S3_ENDPOINT" s3 cp - "s3://${TAG_BUCKET}/status/${SERVICE}.json" \
        --content-type 'application/json' >/dev/null 2>&1 || true
}

# Mark a successful roll: publish the terminal ok status and stop the EXIT trap
# from overwriting it with a "failed" on the way out.
finish_ok() {
  STATUS_DONE=1
  publish_status done ok '' 0
}

# Safety net — if the script exits non-zero without a terminal status already
# written (an unexpected crash rather than a clean die), record it so the
# status object never goes stale-silent on a real failure.
STATUS_DONE=0
on_exit() {
  local code=$?
  [[ $code -ne 0 && $STATUS_DONE -eq 0 ]] && publish_status failed failed "uncaught exit=$code" "$code"
  return 0
}
trap on_exit EXIT

# Push a failed container's recent logs to the boot-diag prefix so we can read
# WHY a release failed its health gate from CI (fetch-boot-diag) instead of
# losing them when the slot is torn down. Best-effort; no-op if STATE_BUCKET
# is unset (older VMs) or S3 is unreachable.
upload_failed_logs() {
  local svc="$1" ts
  [[ -n "${STATE_BUCKET:-}" && -n "${S3_ENDPOINT:-}" ]] || return 0
  ts=$(date -u +%Y%m%dT%H%M%SZ)
  docker compose --profile "$COMPOSE_PROFILE" logs --no-color --tail=200 "$svc" 2>&1 \
    | aws --endpoint-url "$S3_ENDPOINT" s3 cp - \
        "s3://${STATE_BUCKET}/boot-diag/${SERVICE}-failed-${ts}.log" --content-type 'text/plain' >/dev/null 2>&1 || true
}

# Push an arbitrary text blob to the boot-diag prefix under a labelled key so a
# failure cause that isn't a container log (e.g. a docker pull/auth error) is
# still readable from CI (fetch-boot-diag) instead of being lost to journald on
# a box with no SSH. Best-effort; no-op without STATE_BUCKET / S3.
upload_diag_text() {
  local label="$1" body="$2" ts
  [[ -n "${STATE_BUCKET:-}" && -n "${S3_ENDPOINT:-}" ]] || return 0
  ts=$(date -u +%Y%m%dT%H%M%SZ)
  printf '%s\n' "$body" \
    | aws --endpoint-url "$S3_ENDPOINT" s3 cp - \
        "s3://${STATE_BUCKET}/boot-diag/${SERVICE}-${label}-${ts}.log" --content-type 'text/plain' >/dev/null 2>&1 || true
}

# Re-authenticate to the container registry. cloud-init runs `docker login` once
# at boot, but on a long-lived VM that stored login goes stale (the registry
# bearer token expires and nothing refreshes it), so the pull fails with "pull
# access denied" even though the image and credential are still valid. On
# Scaleway the registry password IS the S3 secret key, which the reconciler
# already holds as AWS_SECRET_ACCESS_KEY, so we refresh the login ourselves with
# no extra secret plumbing. The secret goes via stdin (never argv) and all
# output is discarded, so nothing leaks to journald. Best effort: a stale-token
# failure here just surfaces as the pull error we already capture, so we never
# gate on it.
registry_login() {
  [[ -n "${AWS_SECRET_ACCESS_KEY:-}" ]] || return 0
  printf '%s' "$AWS_SECRET_ACCESS_KEY" \
    | docker login "${REGISTRY%%/*}" -u nologin --password-stdin >/dev/null 2>&1 || true
}

# Pull a service image with bounded retries — the registry is the flaky bit.
# Each attempt re-logs-in first (cheap, idempotent) so a stale boot-time login
# can't strand the roll. On exhaustion we upload the LAST attempt's combined
# output to boot-diag so the actual registry/auth error (manifest unknown,
# unauthorized, token expired, …) is visible from CI rather than hidden behind a
# bare `pull_exhausted`.
pull_with_retries() {
  local svc="$1" attempt out rc
  publish_status pulling rolling
  for ((attempt = 1; attempt <= PULL_RETRIES; attempt++)); do
    registry_login
    out=$(docker compose --profile "$COMPOSE_PROFILE" pull "$svc" 2>&1)
    rc=$?
    printf '%s\n' "$out" >&2
    [[ $rc -eq 0 ]] && return 0
    log WARN "pull_failed attempt=$attempt/$PULL_RETRIES rc=$rc backoff=${PULL_BACKOFF_SECONDS}s"
    sleep "$PULL_BACKOFF_SECONDS"
  done
  upload_diag_text pull-failed "service=$SERVICE tag=$desired
$out"
  return 1
}

# Expand-migrate as a one-shot BEFORE rolling the app (only services that own
# the schema set RUN_MIGRATE=1). Returns non-zero on failure so callers can
# gate hard and leave the running app untouched.
run_migrate_if_enabled() {
  [[ "$RUN_MIGRATE" == "1" ]] || return 0
  publish_status migrating rolling
  log INFO "migrate_start service=$SERVICE tag=$desired"
  # Capture the one-shot migrator's combined output. Without this the migrate
  # stderr only reaches journald, so a `migrate_failed` from CI is a black box
  # on a box with no SSH. On failure we upload it to boot-diag (like the pull
  # capture) so the real cause (missing role grant, bad admin URL, a failing
  # migration, …) is readable from the deploy logs.
  #
  # Bounded retries: migrate is idempotent, so a transient admin-DB blip is
  # retried with backoff rather than escalated straight to a TERMINAL exit 6.
  # Only the LAST attempt's output is uploaded to boot-diag on final exhaustion.
  local attempt out rc
  for ((attempt = 1; attempt <= MIGRATE_RETRIES; attempt++)); do
    out=$(docker compose --profile "$COMPOSE_PROFILE" run --rm migrate 2>&1)
    rc=$?
    printf '%s\n' "$out" >&2
    if [[ $rc -eq 0 ]]; then
      log INFO "migrate_complete service=$SERVICE tag=$desired"
      return 0
    fi
    log WARN "migrate_failed attempt=$attempt/$MIGRATE_RETRIES rc=$rc backoff=${MIGRATE_BACKOFF_SECONDS}s"
    [[ $attempt -lt $MIGRATE_RETRIES ]] && sleep "$MIGRATE_BACKOFF_SECONDS"
  done
  upload_diag_text migrate-failed "service=$SERVICE tag=$desired
$out"
  return 1
}

# Persist the rolled tag (and demote the prior one) once a cutover is committed.
commit_tag_state() {
  [[ -n "$current" ]] && printf '%s' "$current" > "$PREVIOUS_TAG_FILE"
  printf '%s' "$desired" > "$CURRENT_TAG_FILE"
}

# --- Blue-green helpers (used only when ROLLOVER_STRATEGY=blue-green) --------
# Probe a slot's /health DIRECTLY over the compose network. Blue-green slots
# publish no host port, so we exec into the slot and curl its own loopback.
# Polls until /health returns 200/204 AND X-App-Version matches the desired tag
# (proving the NEW container is answering), or HEALTH_TIMEOUT_SECONDS elapses.
bg_probe_slot() {
  local svc="$1" want="$2" out status served
  local deadline=$(( SECONDS + HEALTH_TIMEOUT_SECONDS ))
  while (( SECONDS < deadline )); do
    # Use the explicit IPv4 loopback, NOT `localhost`: alpine/musl resolves
    # `localhost` to ::1 first (RFC 3484) and the app binds IPv4-only, so a
    # `localhost` probe gets ECONNREFUSED and the slot never passes its gate.
    out=$(docker compose --profile "$COMPOSE_PROFILE" exec -T "$svc" \
          wget -S -q -O /dev/null "http://127.0.0.1:${HEALTH_PORT}/health" 2>&1 || true)
    status=$(printf '%s' "$out" | grep -oE 'HTTP/[0-9.]+ [0-9]{3}' | awk '{print $2}' | tail -1)
    served=$(printf '%s' "$out" | awk -F': *' 'tolower($1) ~ /x-app-version/{gsub(/\r/,"",$2); print $2; exit}')
    if [[ ( "$status" == "200" || "$status" == "204" ) && "$served" == "$want" ]]; then
      return 0
    fi
    sleep "$HEALTH_INTERVAL_SECONDS"
  done
  log ERROR "slot_health_mismatch svc=$svc desired=$want served=${served:-<missing>} status=${status:-<none>}"
  return 1
}

# Verify the flip took effect THROUGH the ingress on the host port. Shorter
# budget than the slot probe — the slot is already proven healthy, this only
# confirms caddy reload routed traffic to it.
bg_probe_ingress() {
  local want="$1" headers status served
  local url="http://${HEALTH_HOST}:${HEALTH_PORT}/health"
  local deadline=$(( SECONDS + 30 ))
  while (( SECONDS < deadline )); do
    headers=$(curl -sS -D - -o /dev/null --max-time 5 "$url" 2>/dev/null || true)
    status=$(printf '%s' "$headers" | awk 'NR==1{print $2}')
    served=$(printf '%s' "$headers" | awk -F': ' 'tolower($1)=="x-app-version"{gsub(/\r/,"",$2); print $2; exit}')
    if [[ ( "$status" == "200" || "$status" == "204" ) && "$served" == "$want" ]]; then
      return 0
    fi
    sleep "$HEALTH_INTERVAL_SECONDS"
  done
  return 1
}

# Dump a failed slot's logs to journald + the boot-diag file before tearing it
# down, so we can see WHY a release failed its health gate instead of losing it.
bg_dump_logs() {
  local svc="$1" tag="$2"
  {
    echo "=== reconciler: failed roll-forward service=$svc desired=$tag ==="
    docker compose --profile "$COMPOSE_PROFILE" logs --no-color --tail=200 "$svc" 2>&1 || true
  } | tee -a "$STATE_DIR/last-failed-roll.log" >&2
  upload_failed_logs "$svc"
}

# --- Roll strategies --------------------------------------------------------
# blue_green_roll / in_place_roll are the two cutover paths the main flow
# dispatches to based on ROLLOVER_STRATEGY. Both run AFTER the shared prologue
# (TAG_VAR exported, cwd=$COMPOSE_DIR, ingress ensured up) and read the globals
# `desired` / `current` / `TAG_VAR`. Each one ENDS the script itself: `exit 0`
# on a committed cutover, or `die <code>` on failure.

# Blue-green cutover (opt-in services, e.g. backend). Instead of recreating the
# app container in place, run two named slots (<svc>-blue / <svc>-green). The
# ingress upstream points at the ACTIVE slot; we bring the IDLE slot up on the
# new tag, identity-gate it DIRECTLY (it has no host port — probe over the
# compose network), then flip the ingress to it with `caddy reload` and retire
# the old slot after a short drain. A bad release never touches the serving
# slot. See infra/INFRA_ARCHITECTURE.md.
blue_green_roll() {
  ACTIVE_SLOT_FILE="$STATE_DIR/active.slot"
  active_slot="blue"
  [[ -f "$ACTIVE_SLOT_FILE" ]] && active_slot=$(< "$ACTIVE_SLOT_FILE")
  if [[ "$active_slot" == "green" ]]; then idle_slot="blue"; else idle_slot="green"; fi
  active_svc="${SERVICE}-${active_slot}"
  idle_svc="${SERVICE}-${idle_slot}"
  ACTIVE_SLOT_NAME="$active_slot"

  # Bootstrap: if the active slot isn't running (fresh/replaced VM that hasn't
  # booted an app yet, or a crashed slot), just (re)start the ACTIVE slot on the
  # desired tag in place — the ingress already points at it, so there's nothing
  # to flip. Mirrors docker-rollout's "if it's not running, just start it".
  if [[ -z "$(docker compose --profile "$COMPOSE_PROFILE" ps -q "$active_svc" 2>/dev/null)" ]]; then
    log INFO "bluegreen_bootstrap slot=$active_slot tag=$desired"
    pull_with_retries "$active_svc" || die 3 "pull_exhausted tag=$desired"
    run_migrate_if_enabled || die 6 "migrate_failed tag=$desired"
    publish_status slot-up rolling
    docker compose --profile "$COMPOSE_PROFILE" up -d --no-deps "$active_svc" >&2 || die 4 "compose_up_failed tag=$desired"
    publish_status probing rolling
    if bg_probe_slot "$active_svc" "$desired"; then
      log INFO "rolled service=$SERVICE slot=$active_slot tag=$desired action=bootstrap"
      printf '%s' "$active_slot" > "$ACTIVE_SLOT_FILE"
      commit_tag_state
      finish_ok
      exit 0
    fi
    bg_dump_logs "$active_svc" "$desired"
    die 5 "bluegreen_bootstrap_health_failed tag=$desired"
  fi

  log INFO "bluegreen_cutover service=$SERVICE active=$active_slot idle=$idle_slot tag=$desired"

  # 1. pull the idle slot image (same ref as active; registry is the flaky bit)
  pull_with_retries "$idle_svc" || die 3 "pull_exhausted tag=$desired"

  # 2. expand-migrate BEFORE the new slot boots (additive; old slot keeps
  #    serving the pre-migration schema). Gate hard — leave the active slot be.
  run_migrate_if_enabled || die 6 "migrate_failed tag=$desired"

  # 3. bring the idle slot up ALONGSIDE the still-serving active slot
  publish_status slot-up rolling
  if ! docker compose --profile "$COMPOSE_PROFILE" up -d --no-deps "$idle_svc" >&2; then
    die 4 "compose_up_failed slot=$idle_slot tag=$desired"
  fi

  # 4. identity-gate the idle slot directly. Old slot serves all traffic here.
  publish_status probing rolling
  if ! bg_probe_slot "$idle_svc" "$desired"; then
    log ERROR "bluegreen_health_failed slot=$idle_slot desired=$desired"
    bg_dump_logs "$idle_svc" "$desired"
    # Tear down ONLY the failed idle slot; the active slot is untouched and
    # keeps serving. No current.tag/active.slot write — next tick retries.
    docker compose --profile "$COMPOSE_PROFILE" rm -sf "$idle_svc" >&2 || true
    die 5 "bluegreen_rolled_back slot=$idle_slot tag=$desired"
  fi

  # 5. flip the ingress to the new slot. Persist to .env (so a future ingress
  #    restart picks the right slot) AND live-reload the running proxy. caddy
  #    reload adapts the Caddyfile client-side using the exec'd env, so the -e
  #    override decides the new upstream (see infra/ingress.Caddyfile).
  log INFO "bluegreen_flip from=$active_slot to=$idle_slot"
  publish_status flipping rolling
  sed -i -E "s|^UPSTREAM_HOST=.*|UPSTREAM_HOST=${idle_svc}|" "$COMPOSE_DIR/.env" 2>/dev/null || true
  if ! docker compose --profile "$COMPOSE_PROFILE" exec -T -e "UPSTREAM_HOST=${idle_svc}" ingress \
       caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile >&2; then
    die 5 "bluegreen_caddy_reload_failed slot=$idle_slot"
  fi

  # 6. verify the flip took effect THROUGH the ingress on the host port
  publish_status verifying rolling
  if ! bg_probe_ingress "$desired"; then
    log ERROR "bluegreen_verify_failed slot=$idle_slot desired=$desired"
    die 5 "bluegreen_verify_failed slot=$idle_slot"
  fi

  # Cutover committed — record state.
  ACTIVE_SLOT_NAME="$idle_slot"
  printf '%s' "$idle_slot" > "$ACTIVE_SLOT_FILE"
  commit_tag_state
  log INFO "rolled service=$SERVICE slot=$idle_slot tag=$desired"

  # 7. drain in-flight requests on the old slot, then retire it.
  publish_status draining rolling
  sleep "$DRAIN_SECONDS"
  docker compose --profile "$COMPOSE_PROFILE" stop "$active_svc" >&2 || true
  log INFO "bluegreen_retired slot=$active_slot"
  finish_ok
  exit 0
}

# In-place roll (default). Recreate ONLY the app container behind the ingress
# (`up -d --no-deps`), identity-gate it through the ingress on the host port,
# and roll back to the previous tag if the new container never answers with the
# desired X-App-Version.
in_place_roll() {
  pull_with_retries "$SERVICE" || die 3 "pull_exhausted tag=$desired"

  # --- Expand-migrate (before rollover) -------------------------------------
  # For services that own the schema (RUN_MIGRATE=1, i.e. backend), apply
  # pending migrations as a one-shot BEFORE rolling the serve-only app. The old
  # app keeps serving the un-migrated schema until this succeeds; migrations are
  # additive (expand-before-rollover convention), so the old code tolerates the
  # new schema. Gate hard on exit 0 — if migrate fails we leave the running app
  # untouched and do NOT write current.tag, so the next tick retries without a
  # half-applied roll.
  run_migrate_if_enabled || die 6 "migrate_failed tag=$desired"

  # Recreate ONLY the app container — never the ingress proxy. --no-deps keeps
  # compose from touching anything else in the profile.
  publish_status slot-up rolling
  if ! docker compose --profile "$COMPOSE_PROFILE" up -d --no-deps "$SERVICE" >&2; then
    die 4 "compose_up_failed tag=$desired"
  fi

  # --- Health check ---------------------------------------------------------
  # The container's /health returns X-App-Version: <RELEASE_SHA>. We poll until
  # it matches `desired` — that proves the *new* container is the one answering,
  # not the old one we just asked compose to replace. The probe goes through the
  # ingress proxy on HEALTH_PORT, which forwards to the app; during the restart
  # gap ingress retries the upstream so the poll simply keeps waiting until the
  # new container is live. compose's own healthcheck only checks 200/204, not
  # identity.
  health_url="http://${HEALTH_HOST}:${HEALTH_PORT}/health"
  deadline=$(( SECONDS + HEALTH_TIMEOUT_SECONDS ))
  served=""
  publish_status probing rolling
  while (( SECONDS < deadline )); do
    headers=$(curl -sS -D - -o /dev/null --max-time 5 "$health_url" 2>/dev/null || true)
    status=$(printf '%s' "$headers" | awk 'NR==1{print $2}')
    served=$(printf '%s' "$headers" | awk -F': ' 'tolower($1)=="x-app-version"{gsub(/\r/,"",$2); print $2; exit}')
    if [[ ( "$status" == "200" || "$status" == "204" ) && "$served" == "$desired" ]]; then
      log INFO "rolled service=$SERVICE tag=$desired"
      commit_tag_state
      finish_ok
      exit 0
    fi
    sleep "$HEALTH_INTERVAL_SECONDS"
  done

  log ERROR "health_mismatch desired=$desired served=${served:-<missing>} status=${status:-<none>}"

  # --- Capture the FAILED new container's logs ------------------------------
  # Before we roll back and lose them, dump the new container's logs to journald
  # (and to a file the boot-diag uploader collects). Without this we only ever
  # see the rolled-back OLD container and stay blind to *why* the new one failed
  # its health gate.
  {
    echo "=== reconciler: failed roll-forward service=$SERVICE desired=$desired ==="
    docker compose --profile "$COMPOSE_PROFILE" logs --no-color --tail=200 "$SERVICE" 2>&1 || true
  } | tee -a "$STATE_DIR/last-failed-roll.log" >&2
  upload_failed_logs "$SERVICE"

  # --- Rollback -------------------------------------------------------------
  # We deliberately do NOT rollback if there's no prior tag: a fresh VM that
  # can't start its very first deploy should stay broken and visible to the
  # next deploy attempt rather than silently pretending to succeed.
  if [[ -z "$current" ]]; then
    die 5 "rollback_skipped reason=no_prior_tag"
  fi

  log WARN "rolling_back service=$SERVICE to=$current"
  export "$TAG_VAR=$current"
  if docker compose --profile "$COMPOSE_PROFILE" pull "$SERVICE" >&2 \
     && docker compose --profile "$COMPOSE_PROFILE" up -d --no-deps "$SERVICE" >&2; then
    log WARN "rollback_complete service=$SERVICE tag=$current"
  else
    log ERROR "rollback_failed service=$SERVICE tag=$current"
  fi
  exit 5
}

# --- Single-instance lock ---------------------------------------------------
# -n: non-blocking. If another tick is already running, exit 0 silently —
# log nothing, because the timer fires often and we don't want to spam
# journald with "skipped" lines.
exec 9>"$LOCK_FILE" || die 1 "cannot open lock=$LOCK_FILE"
flock -n 9 || exit 0

# --- Load config ------------------------------------------------------------
[[ -r "$ENV_FILE" ]] || die 1 "env_file_missing=$ENV_FILE"
# shellcheck disable=SC1090
source "$ENV_FILE"

: "${SERVICE:?SERVICE not set}"
: "${COMPOSE_PROFILE:?COMPOSE_PROFILE not set}"
: "${HEALTH_PORT:?HEALTH_PORT not set}"
: "${TAG_BUCKET:?TAG_BUCKET not set}"
: "${TAG_KEY:?TAG_KEY not set}"
: "${REGION:?REGION not set}"
: "${REGISTRY:?REGISTRY not set}"
COMPOSE_DIR=${COMPOSE_DIR:-/opt/app}
HEALTH_HOST=${HEALTH_HOST:-127.0.0.1}
HEALTH_TIMEOUT_SECONDS=${HEALTH_TIMEOUT_SECONDS:-90}
HEALTH_INTERVAL_SECONDS=${HEALTH_INTERVAL_SECONDS:-3}
PULL_RETRIES=${PULL_RETRIES:-6}
PULL_BACKOFF_SECONDS=${PULL_BACKOFF_SECONDS:-10}
RUN_MIGRATE=${RUN_MIGRATE:-0}
# The one-shot migrate is idempotent (createDbRoles is IF-NOT-EXISTS / idempotent
# GRANTs; pgMigrate takes an advisory lock and only applies pending migrations),
# so a non-zero exit caused by a transient admin-DB blip (brief PG failover, a
# 10s connection timeout, advisory-lock contention) is safe to retry. Bounded
# retries here turn such a blip into a self-heal instead of a TERMINAL exit 6
# that fast-fails an otherwise-unrelated deploy.
MIGRATE_RETRIES=${MIGRATE_RETRIES:-6}
MIGRATE_BACKOFF_SECONDS=${MIGRATE_BACKOFF_SECONDS:-10}
ROLLOVER_STRATEGY=${ROLLOVER_STRATEGY:-in-place}
DRAIN_SECONDS=${DRAIN_SECONDS:-10}
# Optional: bucket for failed-slot log uploads (boot-diag prefix). Unset on
# older VMs — upload_failed_logs no-ops when empty.
STATE_BUCKET=${STATE_BUCKET:-}
# Informational slot name carried into the status object; set by the
# blue-green path once it knows which slot is (becoming) active.
ACTIVE_SLOT_NAME=""

mkdir -p "$STATE_DIR"
CURRENT_TAG_FILE="$STATE_DIR/current.tag"
PREVIOUS_TAG_FILE="$STATE_DIR/previous.tag"

# Keep docker's credential + config under STATE_DIR. The systemd unit runs with
# ProtectHome=true, which makes /root (where cloud-init's boot-time `docker
# login` wrote ~/.docker/config.json) appear EMPTY and READ-ONLY to this
# service — so a timer-driven run can neither read that login nor write a fresh
# one to the default path, and the pull fails with "pull access denied" even
# though the image exists and the secret is valid. STATE_DIR is a ReadWritePath
# in the unit, so pointing DOCKER_CONFIG here gives registry_login a writable,
# sandbox-immune home that the very next `docker compose pull` reads from.
export DOCKER_CONFIG="$STATE_DIR/.docker"
mkdir -p "$DOCKER_CONFIG"

command -v aws >/dev/null    || die 1 "aws_cli_missing"
command -v docker >/dev/null || die 1 "docker_missing"
command -v curl >/dev/null   || die 1 "curl_missing"

S3_ENDPOINT="https://s3.${REGION}.scw.cloud"

runtime_env_hash() {
  local env_file="${COMPOSE_DIR}/.env.runtime"
  if [[ -f "$env_file" ]]; then
    sha256sum "$env_file" | awk '{print $1}'
  else
    printf '<missing>'
  fi
}

secrets_changed=0
if [[ -x /usr/local/bin/runtime-secret-sync ]]; then
  publish_status syncing rolling
  before_secret_hash=$(runtime_env_hash)
  # Capture stderr so a sync failure is debuggable from CI/laptop without SSH.
  # runtime-secret-sync prints the offending `<ENV_VAR>: <http-code>` lines and
  # a summary to stderr; on a long-lived VM (timer-driven) those would otherwise
  # vanish into journald. Upload them to the boot-diag prefix before dying.
  if ! sync_err=$(/usr/local/bin/runtime-secret-sync 2>&1); then
    upload_diag_text secret-sync-failed "$sync_err"
    die 1 "runtime_secret_sync_failed"
  fi
  after_secret_hash=$(runtime_env_hash)
  if [[ "$before_secret_hash" != "$after_secret_hash" ]]; then
    secrets_changed=1
    log INFO "runtime_secret_change service=$SERVICE before=$before_secret_hash after=$after_secret_hash"
  fi
fi

# --- Fetch desired tag ------------------------------------------------------
# The tag object is created by CI's first roll (PutObject), NOT seeded by
# Pulumi — so on a fresh stack, before any release, it simply does not exist.
# Classify the fetch outcome instead of collapsing every failure to one exit:
#   - object MISSING (404 / NoSuchKey) → no release pushed yet. Keep whatever is
#     running and stay quiet; the timer converges once CI writes the first SHA.
#   - any OTHER failure (auth, network, S3 down) → real. Upload the error to
#     boot-diag and die 2 so it surfaces in the status channel rather than
#     silently not deploying.
# Fail-safe by design: we skip ONLY on a confirmed not-found; anything
# ambiguous falls through to die.
fetch_err_file="$STATE_DIR/.tag-fetch-err"
raw_desired=$(aws --endpoint-url "$S3_ENDPOINT" s3 cp "s3://${TAG_BUCKET}/${TAG_KEY}" - 2>"$fetch_err_file")
fetch_rc=$?
if [[ $fetch_rc -ne 0 ]]; then
  if grep -qiE '404|not found|nosuchkey|does not exist' "$fetch_err_file"; then
    log INFO "tag_absent action=skip key=$TAG_KEY"
    rm -f "$fetch_err_file"
    exit 0
  fi
  upload_diag_text tag-fetch-failed "key=$TAG_KEY rc=$fetch_rc
$(cat "$fetch_err_file" 2>/dev/null)"
  rm -f "$fetch_err_file"
  die 2 "tag_fetch_failed bucket=$TAG_BUCKET key=$TAG_KEY rc=$fetch_rc"
fi
rm -f "$fetch_err_file"
desired=$(printf '%s' "$raw_desired" | tr -d '[:space:]')
if [[ -z "$desired" ]]; then
  die 2 "tag_empty bucket=$TAG_BUCKET key=$TAG_KEY"
fi

current=""
[[ -f "$CURRENT_TAG_FILE" ]] && current=$(< "$CURRENT_TAG_FILE")

if [[ "$desired" == "$current" && "$secrets_changed" != "1" ]]; then
  # Steady state. Nothing to do; stay quiet.
  exit 0
fi

if [[ "$desired" == "$current" ]]; then
  log INFO "config_change service=$SERVICE tag=$desired"
else
  log INFO "tag_change service=$SERVICE from=${current:-<none>} to=$desired"
fi
publish_status start rolling

# --- Compose up cutover -----------------------------------------------------
# The compose file references the image as ${REGISTRY}/<svc>:${<SVC>_TAG};
# we re-export the var (uppercased + _TAG suffix matching compose.yml) so the
# next `up -d` picks the new tag without editing the YAML on disk.
TAG_VAR="$(echo "$SERVICE" | tr '[:lower:]' '[:upper:]')_TAG"
export "$TAG_VAR=$desired"
export REGISTRY

cd "$COMPOSE_DIR" || die 1 "compose_dir_missing=$COMPOSE_DIR"

# Ensure the ingress proxy is up before rolling the app. Idempotent: compose
# only (re)creates it if its config changed, which it doesn't on an app deploy.
# Without this, a reconciler-driven first boot (no fallback compose up) would
# roll the app with no proxy in front of it.
docker compose --profile "$COMPOSE_PROFILE" up -d --no-deps ingress >&2 || true

# --- Roll the service -------------------------------------------------------
# Dispatch to the configured cutover path (both defined up top). blue-green runs
# two slots + an ingress flip so a bad release never touches the serving
# container; in-place recreates the single app container behind the ingress.
# Each function ends the script itself (exit 0 on success, die <code> on failure).
if [[ "$ROLLOVER_STRATEGY" == "blue-green" ]]; then
  blue_green_roll
else
  in_place_roll
fi
