import { describe, expect, it } from 'vitest'
import {
  buildInstallSnippet,
  buildReconcilerEnv,
  reconcilerScript,
  reconcilerService,
  reconcilerServices,
  reconcilerTimer,
} from './index.js'

describe('buildReconcilerEnv', () => {
  const baseInput = {
    service: 'backend' as const,
    tagBucket: 'cella-deploy-tags',
    region: 'fr-par',
    registry: 'rg.fr-par.scw.cloud/cella',
    stateBucket: 'cella-pulumi-state',
    awsAccessKeyId: 'SCWAKIDEXAMPLE',
    awsSecretAccessKey: 'sekret',
  }

  it('emits the required keys plus AWS creds', () => {
    const env = buildReconcilerEnv(baseInput)
    for (const k of [
      'SERVICE=', 'COMPOSE_PROFILE=', 'HEALTH_PORT=', 'HEALTH_TIMEOUT_SECONDS=', 'RUN_MIGRATE=',
      'ROLLOVER_STRATEGY=', 'DRAIN_SECONDS=',
      'TAG_BUCKET=', 'TAG_KEY=', 'STATE_BUCKET=', 'REGION=', 'REGISTRY=',
      'AWS_ACCESS_KEY_ID=', 'AWS_SECRET_ACCESS_KEY=',
    ]) expect(env).toContain(k)
  })

  it('only the backend (schema owner) runs migrations', () => {
    const runMigrate: Record<string, string> = {
      backend: '1', cdc: '0', yjs: '0', ai: '0', frontend: '0',
    }
    for (const svc of reconcilerServices) {
      const env = buildReconcilerEnv({ ...baseInput, service: svc })
      expect(env).toContain(`RUN_MIGRATE='${runMigrate[svc]}'`)
    }
  })

  it('only the backend opts into blue-green slot rollover', () => {
    const strategy: Record<string, string> = {
      backend: 'blue-green', cdc: 'in-place', yjs: 'in-place', ai: 'in-place', frontend: 'in-place',
    }
    for (const svc of reconcilerServices) {
      const env = buildReconcilerEnv({ ...baseInput, service: svc })
      expect(env).toContain(`ROLLOVER_STRATEGY='${strategy[svc]}'`)
    }
  })

  it('gives the blue-green backend a drain window, the in-place services none', () => {
    const drain: Record<string, string> = {
      backend: '10', cdc: '0', yjs: '0', ai: '0', frontend: '0',
    }
    for (const svc of reconcilerServices) {
      const env = buildReconcilerEnv({ ...baseInput, service: svc })
      expect(env).toContain(`DRAIN_SECONDS='${drain[svc]}'`)
    }
  })

  it('gives the heavy backend/ai images a larger health budget than the rest', () => {
    const timeouts: Record<string, string> = {
      backend: '240', cdc: '90', yjs: '90', ai: '240', frontend: '90',
    }
    for (const svc of reconcilerServices) {
      const env = buildReconcilerEnv({ ...baseInput, service: svc })
      expect(env).toContain(`HEALTH_TIMEOUT_SECONDS='${timeouts[svc]}'`)
    }
  })

  it('TAG_KEY follows the deploy/<service>.tag layout', () => {
    expect(buildReconcilerEnv({ ...baseInput, service: 'cdc' })).toContain(
      "TAG_KEY='deploy/cdc.tag'",
    )
  })

  it('assigns the well-known health port per service', () => {
    const ports: Record<string, string> = {
      backend: '4000', cdc: '4001', yjs: '4002', ai: '4003', frontend: '80',
    }
    for (const svc of reconcilerServices) {
      const env = buildReconcilerEnv({ ...baseInput, service: svc })
      expect(env).toContain(`HEALTH_PORT='${ports[svc]}'`)
    }
  })

  it('single-quotes every value so shell metacharacters cannot break out', () => {
    const env = buildReconcilerEnv({
      ...baseInput,
      // pathological: an actual single quote in a secret would corrupt the file
      awsSecretAccessKey: "weird'val",
    })
    expect(env).toContain(`AWS_SECRET_ACCESS_KEY='weird'\\''val'`)
  })

  it('rejects unknown services so typos fail loudly', () => {
    expect(() =>
      // @ts-expect-error — intentional invalid service for the negative path
      buildReconcilerEnv({ ...baseInput, service: 'kafka' }),
    ).toThrow(/unknown reconciler service/)
  })

  it('compose profile matches the service name (current convention)', () => {
    for (const svc of reconcilerServices) {
      const env = buildReconcilerEnv({ ...baseInput, service: svc })
      expect(env).toContain(`COMPOSE_PROFILE='${svc}'`)
    }
  })
})

describe('reconciler files', () => {
  it('script declares the contract used by the env file', () => {
    // If anyone deletes a required env var from the script, the env tests
    // would still pass — this guard ties them together.
    for (const v of ['SERVICE', 'COMPOSE_PROFILE', 'HEALTH_PORT', 'TAG_BUCKET', 'TAG_KEY', 'REGION']) {
      expect(reconcilerScript).toContain(`\${${v}:?`)
    }
  })

  it('script handles the bootstrap placeholder as a no-op', () => {
    expect(reconcilerScript).toMatch(/desired.*==.*bootstrap/)
  })

  it('script verifies X-App-Version matches desired before declaring success', () => {
    expect(reconcilerScript.toLowerCase()).toContain('x-app-version')
    expect(reconcilerScript).toContain('"$served" == "$desired"')
  })

  it('script refuses to rollback on first-deploy failure', () => {
    expect(reconcilerScript).toContain('rollback_skipped reason=no_prior_tag')
  })

  it('rolls only the app container with --no-deps so the ingress proxy survives', () => {
    // The whole zero-downtime story depends on NOT recreating the ingress on a
    // deploy. Both the cutover and rollback paths must be service-scoped.
    expect(reconcilerScript).toContain('up -d --no-deps "$SERVICE"')
    expect(reconcilerScript).toContain('pull "$SERVICE"')
    // A bare `up -d` (whole profile) would recreate the ingress and drop the
    // host listener — guard against it creeping back in for the app roll.
    expect(reconcilerScript).not.toMatch(/docker compose --profile "\$COMPOSE_PROFILE" up -d >&2/)
  })

  it('ensures the ingress proxy is up before cutover', () => {
    expect(reconcilerScript).toContain('up -d --no-deps ingress')
  })

  it('blue-green path flips the ingress via caddy reload and drains the old slot', () => {
    // The blue-green cutover must (a) be gated behind the blue-green strategy,
    // (b) bring up the IDLE slot alongside the active one, (c) flip the upstream
    // with a live `caddy reload`, and (d) only retire the old slot AFTER a drain.
    expect(reconcilerScript).toContain('if [[ "$ROLLOVER_STRATEGY" == "blue-green" ]]; then')
    expect(reconcilerScript).toContain('up -d --no-deps "$idle_svc"')
    expect(reconcilerScript).toContain('caddy reload --config /etc/caddy/Caddyfile')
    expect(reconcilerScript).toContain('sleep "$DRAIN_SECONDS"')
    expect(reconcilerScript).toContain('stop "$active_svc"')
  })

  it('blue-green failure tears down ONLY the idle slot, never the serving one', () => {
    // A failed release must leave the active slot untouched and remove just the
    // bad idle slot — no destructive rollback of the container serving traffic.
    expect(reconcilerScript).toContain('rm -sf "$idle_svc"')
    expect(reconcilerScript).toContain('bluegreen_rolled_back')
  })

  it('publishes a status object on every transition and a failure reason on exit', () => {
    // The status channel is the deploy-observability contract: CI and humans
    // read s3://<tag-bucket>/status/<svc>.json to see WHAT the reconciler did
    // and WHY a roll failed. The EXIT trap must publish a failed status so an
    // unexpected crash never goes stale-silent.
    expect(reconcilerScript).toContain('publish_status()')
    expect(reconcilerScript).toContain('status/${SERVICE}.json')
    expect(reconcilerScript).toContain('trap on_exit EXIT')
    expect(reconcilerScript).toContain('publish_status failed failed')
  })

  it('uploads a failed slot\'s logs to the boot-diag prefix for post-mortem', () => {
    // Without this the failed slot is torn down and its logs are lost; CI must
    // be able to read why the health gate failed without SSH.
    expect(reconcilerScript).toContain('upload_failed_logs()')
    expect(reconcilerScript).toContain('boot-diag/${SERVICE}-failed-')
  })

  it('uploads the docker pull stderr on pull_exhausted so registry/auth errors are visible', () => {
    // The last attempt's combined output must reach boot-diag (fetch-boot-diag
    // surfaces it) so a manifest/unauthorized/expired-token error is debuggable
    // sans SSH.
    expect(reconcilerScript).toContain('upload_diag_text()')
    expect(reconcilerScript).toContain('upload_diag_text pull-failed')
  })

  it('refreshes the registry login before pulling so a stale boot-time login cannot strand a roll', () => {
    // cloud-init logs in once at boot; on a long-lived VM that token goes stale
    // and the pull fails with "pull access denied" even though the image exists.
    // The reconciler re-auths with the secret it already holds (the Scaleway
    // secret key == registry password == AWS_SECRET_ACCESS_KEY) before pulling.
    expect(reconcilerScript).toContain('registry_login()')
    // password via stdin (never argv) against the registry HOST (namespace stripped)
    expect(reconcilerScript).toContain('docker login "${REGISTRY%%/*}" -u nologin --password-stdin')
    // and it runs as the first thing inside the pull retry loop
    expect(reconcilerScript).toMatch(/for \(\(attempt[^\n]*\n\s*registry_login/)
    // ProtectHome=true makes /root read-only, so docker needs a writable config
    // dir under the unit's ReadWritePath (STATE_DIR) or the login cannot persist.
    expect(reconcilerScript).toContain('export DOCKER_CONFIG="$STATE_DIR/.docker"')
  })

  it('runs runtime secret sync on every tick and treats secret changes as a rollout trigger', () => {
    expect(reconcilerScript).toContain('runtime_env_hash()')
    expect(reconcilerScript).toContain('/usr/local/bin/runtime-secret-sync')
    expect(reconcilerScript).toContain('runtime_secret_change service=$SERVICE')
    expect(reconcilerScript).toContain('if [[ "$desired" == "$current" && "$secrets_changed" != "1" ]]; then')
    expect(reconcilerScript).toContain('config_change service=$SERVICE tag=$desired')
  })

  it('uploads the migrate output on migrate_failed so the real cause is visible', () => {
    // The one-shot migrator's stderr used to only reach journald, so a
    // migrate_failed from CI was a black box. Capture its combined output and
    // push it to boot-diag like the pull capture.
    expect(reconcilerScript).toContain('upload_diag_text migrate-failed')
    expect(reconcilerScript).toContain('docker compose --profile "$COMPOSE_PROFILE" run --rm migrate 2>&1')
  })

  it('retries the idempotent migrate before escalating to a terminal failure', () => {
    // The one-shot migrate is idempotent, so a transient admin-DB blip (PG
    // failover, a 10s connection timeout, advisory-lock contention) must be
    // retried with backoff rather than fast-failing an unrelated deploy with a
    // TERMINAL exit 6. Only the last attempt's output is uploaded on exhaustion.
    expect(reconcilerScript).toContain('MIGRATE_RETRIES=${MIGRATE_RETRIES:-6}')
    expect(reconcilerScript).toContain('MIGRATE_BACKOFF_SECONDS=${MIGRATE_BACKOFF_SECONDS:-10}')
    // the migrate command runs inside an attempt loop
    expect(reconcilerScript).toMatch(/for \(\(attempt = 1; attempt <= MIGRATE_RETRIES[^\n]*\n\s*out=\$\(docker compose --profile "\$COMPOSE_PROFILE" run --rm migrate/)
    expect(reconcilerScript).toContain('migrate_failed attempt=$attempt/$MIGRATE_RETRIES')
    expect(reconcilerScript).toContain('sleep "$MIGRATE_BACKOFF_SECONDS"')
  })

  it('systemd unit is oneshot with hardening flags', () => {
    expect(reconcilerService).toContain('Type=oneshot')
    expect(reconcilerService).toContain('NoNewPrivileges=true')
    expect(reconcilerService).toContain('ProtectSystem=strict')
    expect(reconcilerService).toContain('EnvironmentFile=/etc/reconciler/reconciler.env')
  })

  it('timer fires fast enough to keep cutover under a minute', () => {
    expect(reconcilerTimer).toContain('OnUnitActiveSec=20s')
    expect(reconcilerTimer).toContain('Persistent=true')
  })
})

describe('buildInstallSnippet', () => {
  const snippet = buildInstallSnippet()

  it('installs all three reconciler files', () => {
    expect(snippet).toContain('/usr/local/bin/reconciler')
    expect(snippet).toContain('/etc/systemd/system/reconciler.service')
    expect(snippet).toContain('/etc/systemd/system/reconciler.timer')
  })

  it('locks down env file permissions', () => {
    expect(snippet).toContain('chmod 0600 /etc/reconciler/reconciler.env')
  })

  it('refuses to enable the timer if the env file is missing', () => {
    expect(snippet).toContain('test -r /etc/reconciler/reconciler.env')
    expect(snippet).toContain('reconciler.env missing')
  })

  it('enables the timer (not the service) so cadence is owned by the .timer', () => {
    expect(snippet).toContain('systemctl enable --now reconciler.timer')
    expect(snippet).not.toMatch(/systemctl enable.*reconciler\.service/)
  })

  it('uses base64 to dodge heredoc-in-heredoc quoting hell', () => {
    expect(snippet).toContain('base64 -d > /usr/local/bin/reconciler')
  })
})
