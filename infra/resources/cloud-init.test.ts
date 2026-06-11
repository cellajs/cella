import { describe, expect, it } from 'vitest'
import { deriveInfra } from '../naming'
import { fakeConfig } from '../tests/helpers/fake-config'
import { type CloudInitParams, renderCloudInit } from './cloud-init'

// Derive the state bucket from the canonical fixture so the test name can never
// drift from the fork slug (naming is a pure function of appConfig).
const stateBucket = deriveInfra(fakeConfig()).naming.pulumiStateBucket

function params(overrides: Partial<CloudInitParams> = {}): CloudInitParams {
  return {
    service: 'backend',
    bootService: 'backend-blue',
    profile: 'backend',
    envFileContent: 'APP_MODE=production\nBACKEND_URL=https://api.example.test',
    runtimeSecretsManifest: JSON.stringify([{ secretId: 'secret-1', envVar: 'COOKIE_SECRET', required: true }], null, 2),
    reconcilerEnvFile: 'SERVICE=backend\nHEALTH_PORT=4000',
    installReconcilerSnippet: 'echo install-reconciler',
    composeContent: 'services:\n  backend: {}',
    ingressContent: ':{$INGRESS_PORT} {\n\thandle /__ingress/health { respond "ok" 200 }\n}',
    registry: 'rg.fr-par.scw.cloud/my-namespace',
    secretKey: 'SCW-SECRET-KEY',
    accessKey: 'SCW-ACCESS-KEY',
    stateBucket,
    region: 'fr-par',
    ...overrides,
  }
}

describe('renderCloudInit', () => {
  it('scrubs secrets from BOTH cloud-init logs', () => {
    const out = renderCloudInit(params())
    // The scrub pattern and both target log files keep creds out of the readable
    // boot log; assert both are present.
    expect(out).toMatch(/sed -i '\/SECRET\\\|PASSWORD\\\|API_KEY\\\|DATABASE_URL\\\|docker login\/Id' \/var\/log\/cloud-init-output\.log/)
    expect(out).toMatch(/sed -i '\/SECRET\\\|PASSWORD\\\|API_KEY\\\|DATABASE_URL\\\|docker login\/Id' \/var\/log\/cloud-init\.log/)
  })

  it('installs the reconciler BEFORE running it to boot the app', () => {
    const out = renderCloudInit(params())
    const reconcilerMark = out.indexOf('mark 40-reconciler-installed')
    const reconcilerRun = out.indexOf('/usr/local/bin/reconciler || true')
    expect(reconcilerMark).toBeGreaterThan(-1)
    expect(reconcilerRun).toBeGreaterThan(-1)
    // Ordering invariant: the reconciler binary + timer must be installed
    // before we invoke it to drive the first boot.
    expect(reconcilerMark).toBeLessThan(reconcilerRun)
  })

  it('runs the reconciler once then falls back to the last-good S3 tag, never sitting empty', () => {
    const out = renderCloudInit(params())
    // No image tag is baked into cloud-init: the fallback sources the tag at
    // runtime from S3 rather than being templated in, so a routine release
    // never changes this script.
    expect(out).toContain("export BACKEND_TAG=\"$fallback_tag\"")
    expect(out).not.toContain("BACKEND_TAG='")
    // Single reconciler attempt drives the happy path; a non-empty current.tag
    // is the "app is up" signal.
    expect(out).toContain('/usr/local/bin/reconciler || true')
    expect(out).toContain('if [[ -s /var/lib/reconciler/current.tag ]]; then')
    // Cloud-init must not loop the reconciler itself; the systemd timer retries.
    expect(out).not.toContain('for attempt in $(seq 1 30); do')
    // Resilience fallback: read the published tag from S3 and boot it with a
    // plain, non-health-gated `up -d --no-deps <service>` so a replaced VM
    // always serves the last-known-good release instead of landing empty.
    expect(out).toContain('s3://${TAG_BUCKET}/${TAG_KEY}')
    // Backend boots its initial active blue-green slot in the fallback path.
    expect(out).toContain('docker compose --profile backend up -d --no-deps backend-blue')
    // An absent tag object (no release yet) yields an empty fallback_tag, which
    // gates the boot — so the fallback must guard on a non-empty value.
    expect(out).toContain('if [[ -n "$fallback_tag" ]]; then')
  })

  it('refuses to boot the app on first boot when required runtime secrets cannot be hydrated', () => {
    const out = renderCloudInit(params())
    // The secret sync result is remembered, not fire-and-forget: a failure must
    // gate the boot so a secret-less crash-loop (502) never masks a missing IAM
    // grant — the fault that took prod down.
    expect(out).toContain('RUNTIME_SECRETS_OK=0')
    expect(out).toContain('if /usr/local/bin/runtime-secret-sync; then')
    expect(out).toContain('RUNTIME_SECRETS_OK=1')
    expect(out).toContain('mark 42-runtime-secrets-FAILED')
    // Fallback path is gated: a published release + failed secret sync must NOT
    // boot the app — it leaves the box app-less (clearly DOWN) and lets the
    // reconciler timer converge once the grant is restored.
    expect(out).toContain('if [[ -n "$fallback_tag" && "$RUNTIME_SECRETS_OK" != "1" ]]; then')
    expect(out).toContain('mark 50-secrets-unavailable-app-not-booted')
    // The actual boot now sits behind an elif, reachable only when secrets are OK.
    expect(out).toContain('elif [[ -n "$fallback_tag" ]]; then')
  })

  it('writes /opt/app/.env with mode 600 and the reconciler env with mode 0600', () => {
    const out = renderCloudInit(params())
    expect(out).toMatch(/chmod 600 \/opt\/app\/\.env/)
    expect(out).toMatch(/chmod 600 \/etc\/runtime-secrets\/manifest\.json/)
    expect(out).toMatch(/chmod 0600 \/etc\/reconciler\/reconciler\.env/)
    expect(out).toMatch(/os\.chmod\(RUNTIME_ENV_PATH, 0o600\)/)
  })

  it('logs into the registry host (not the full namespaced ref) via --password-stdin', () => {
    const out = renderCloudInit(params())
    // Host part only — the namespace must be stripped for `docker login`.
    expect(out).toContain("echo 'SCW-SECRET-KEY' | docker login rg.fr-par.scw.cloud -u nologin --password-stdin")
    // Never put the secret on argv.
    expect(out).not.toMatch(/docker login[^\n]*-p\s+\$/)
  })

  it('derives the S3 endpoint from the region', () => {
    const out = renderCloudInit(params({ region: 'nl-ams' }))
    expect(out).toContain("--endpoint-url 'https://s3.nl-ams.scw.cloud'")
  })

  it('embeds the compose, env and reconciler-env bodies in their heredocs', () => {
    const out = renderCloudInit(params())
    expect(out).toContain('services:\n  backend: {}')
    expect(out).toContain('BACKEND_URL=https://api.example.test')
    expect(out).toContain('"envVar": "COOKIE_SECRET"')
    expect(out).toContain('SERVICE=backend\nHEALTH_PORT=4000')
    expect(out).toContain('echo install-reconciler')
  })

  it('installs and runs the runtime secret sync before booting ingress or the app', () => {
    const out = renderCloudInit(params())
    const syncInstall = out.indexOf('cat > /usr/local/bin/runtime-secret-sync')
    const syncRun = out.indexOf('/usr/local/bin/runtime-secret-sync')
    const ingressUp = out.indexOf('docker compose --profile backend up -d ingress')
    expect(syncInstall).toBeGreaterThan(-1)
    expect(syncRun).toBeGreaterThan(syncInstall)
    expect(ingressUp).toBeGreaterThan(syncRun)
  })

  it('does not corrupt Python newline literals in the runtime secret sync script', () => {
    // The script is embedded in a JS template literal; using '\n'/'\r' there
    // would render as real newlines and break the Python ("unterminated string
    // literal"). chr(10)/chr(13) keep the source robust against that.
    const out = renderCloudInit(params())
    expect(out).toContain('if chr(10) in value or chr(13) in value:')
    expect(out).toContain('payload = chr(10).join(lines)')
    expect(out).not.toContain("if '\n' in value")
  })

  it('keeps runtime secrets out of the static env file and only references secret IDs in the manifest', () => {
    const out = renderCloudInit(params())
    expect(out).not.toContain('COOKIE_SECRET=shhh')
    expect(out).toContain('"secretId": "secret-1"')
    expect(out).toContain('/opt/app/.env.runtime')
  })

  it('writes the ingress.Caddyfile body to /opt/app/ingress.Caddyfile', () => {
    const out = renderCloudInit(params())
    expect(out).toContain('cat > /opt/app/ingress.Caddyfile')
    expect(out).toContain('handle /__ingress/health')
  })

  it('starts the ingress proxy before the reconciler boots the app', () => {
    const out = renderCloudInit(params())
    const ingressUp = out.indexOf('docker compose --profile backend up -d ingress')
    const reconcilerRun = out.indexOf('/usr/local/bin/reconciler || true')
    expect(ingressUp).toBeGreaterThan(-1)
    expect(reconcilerRun).toBeGreaterThan(-1)
    // Ingress must own the host port before any app container is rolled.
    expect(ingressUp).toBeLessThan(reconcilerRun)
  })

  it('uploads stage markers and the full boot log under the state bucket boot-diag prefix', () => {
    const out = renderCloudInit(params())
    expect(out).toContain(`s3://${stateBucket}/boot-diag/backend-stage-`)
    expect(out).toContain(`s3://${stateBucket}/boot-diag/backend-$(date`)
  })
})
