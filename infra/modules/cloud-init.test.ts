import { describe, expect, it } from 'vitest'
import { deriveInfra } from '../naming.js'
import { fakeConfig } from '../tests/helpers/fake-config.js'
import { type CloudInitParams, renderCloudInit } from './cloud-init.js'

// Derive the state bucket from the canonical fixture so the test name can never
// drift from the fork slug (naming is a pure function of appConfig).
const stateBucket = deriveInfra(fakeConfig()).naming.pulumiStateBucket

function params(overrides: Partial<CloudInitParams> = {}): CloudInitParams {
  return {
    service: 'backend',
    bootService: 'backend-blue',
    profile: 'backend',
    envFileContent: 'APP_MODE=production\n\n# Secrets\nCOOKIE_SECRET=shhh',
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
    // The scrub pattern and both target log files must survive refactors —
    // this is the line that keeps creds out of the readable boot log.
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
    // No image tag is baked into cloud-init — a routine release must not change
    // this script (that is the whole point of tag-out-of-cloud-init). The
    // fallback below sources the tag at runtime from S3, it is not templated in.
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
    // 'bootstrap' placeholder must never be booted as an image tag.
    expect(out).toContain('"$fallback_tag" != "bootstrap"')
  })

  it('writes /opt/app/.env with mode 600 and the reconciler env with mode 0600', () => {
    const out = renderCloudInit(params())
    expect(out).toMatch(/chmod 600 \/opt\/app\/\.env/)
    expect(out).toMatch(/chmod 0600 \/etc\/reconciler\/reconciler\.env/)
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
    expect(out).toContain('COOKIE_SECRET=shhh')
    expect(out).toContain('SERVICE=backend\nHEALTH_PORT=4000')
    expect(out).toContain('echo install-reconciler')
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
