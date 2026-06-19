import { describe, expect, it } from 'vitest'
import { type CloudInitParams, renderCloudInit, runtimeSecretSyncScript } from './cloud-init'

function params(overrides: Partial<CloudInitParams> = {}): CloudInitParams {
  return {
    service: 'backend',
    profile: 'backend',
    runMigrate: true,
    releaseSha: 'abc123def',
    envFileContent: 'APP_MODE=production\nBACKEND_TAG=abc123def\nBACKEND_URL=https://api.example.test',
    manifestContent: '[\n  { "envVar": "COOKIE_SECRET", "secretId": "uuid-1", "required": true }\n]',
    composeContent: 'services:\n  backend: {}',
    registry: 'rg.fr-par.scw.cloud/my-namespace',
    accessKey: 'SCW-ACCESS-KEY',
    secretKey: 'SCW-SECRET-KEY',
    region: 'fr-par',
    bootDiagBucket: 'cella-boot-diag',
    dockerPreinstalled: false,
    ...overrides,
  }
}

describe('renderCloudInit (immutable-node)', () => {
  it('scrubs secrets from BOTH cloud-init logs', () => {
    const out = renderCloudInit(params())
    expect(out).toMatch(/sed -i '\/SECRET\\\|PASSWORD\\\|API_KEY\\\|DATABASE_URL\\\|docker login\/Id' \/var\/log\/cloud-init-output\.log/)
    expect(out).toMatch(/sed -i '\/SECRET\\\|PASSWORD\\\|API_KEY\\\|DATABASE_URL\\\|docker login\/Id' \/var\/log\/cloud-init\.log/)
  })

  it('bakes the release SHA into the script and writes the image tag into the static env', () => {
    const out = renderCloudInit(params({ releaseSha: 'deadbeef' }))
    // The generation IS the release — the SHA is baked, not fetched at runtime.
    expect(out).toContain('release=deadbeef')
    expect(out).toContain('BACKEND_TAG=abc123def')
  })

  it('embeds the runtime secret manifest inline (no out-of-band S3 fetch)', () => {
    const out = renderCloudInit(params())
    expect(out).toContain('cat > /etc/runtime-secrets/manifest.json')
    expect(out).toContain('"envVar": "COOKIE_SECRET"')
    // No reconciler and no S3 tag/manifest channel in this model. Boot
    // diagnostics use the dedicated boot diagnostics bucket only.
    expect(out).not.toContain('reconciler')
    expect(out).not.toMatch(/deploy\//)
  })

  it('installs a boot diagnostics uploader for the dedicated bucket', () => {
    const out = renderCloudInit(params())
    expect(out).toContain('/usr/local/bin/cella-upload-boot-diag')
    expect(out).toContain("BOOT_DIAG_BUCKET='cella-boot-diag'")
    expect(out).toContain("SCW_ACCESS_KEY='SCW-ACCESS-KEY'")
    expect(out).toContain("CELLA_SERVICE='backend'")
    expect(out).toContain("CELLA_RELEASE_SHA='abc123def'")
    expect(out).toContain('BOOT_RC="$rc" /usr/local/bin/cella-upload-boot-diag || true')
    expect(out).toContain('boot-diag/{service}-{stamp}-boot.log')
    expect(out).toContain('boot-diag/{service}-failed-{stamp}.log')
  })

  it('renders DIFFERENT userdata when the release SHA changes (a new generation)', () => {
    const a = renderCloudInit(params({ releaseSha: 'sha-a', envFileContent: 'BACKEND_TAG=sha-a' }))
    const b = renderCloudInit(params({ releaseSha: 'sha-b', envFileContent: 'BACKEND_TAG=sha-b' }))
    expect(a).not.toBe(b)
  })

  it('runs the one-shot migrate companion BEFORE starting the app when runMigrate is set', () => {
    const out = renderCloudInit(params({ runMigrate: true }))
    const migrate = out.indexOf('docker compose --profile backend run --rm migrate')
    const appUp = out.indexOf('docker compose --profile backend up -d backend')
    expect(migrate).toBeGreaterThan(-1)
    expect(appUp).toBeGreaterThan(-1)
    expect(migrate).toBeLessThan(appUp)
    // A failed migrate must gate the boot (generation stays unhealthy → cutover aborts).
    expect(out).toContain('FAIL: migrate companion failed')
  })

  it('omits the migrate companion for services that do not run migrations', () => {
    const out = renderCloudInit(params({ runMigrate: false, service: 'yjs', profile: 'yjs' }))
    expect(out).not.toContain('run --rm migrate')
    expect(out).toContain('docker compose --profile yjs up -d yjs')
  })

  it('refuses to boot the app when required runtime secrets cannot be hydrated', () => {
    const out = renderCloudInit(params())
    // A failed sync exits non-zero BEFORE the app starts, so a secret-less
    // crash-loop (502) never masks a missing IAM grant.
    expect(out).toContain('/usr/local/bin/runtime-secret-sync')
    expect(out).toContain('FAIL: runtime-secret-sync')
    const syncRun = out.indexOf('SCW_SECRET_KEY=')
    const appUp = out.indexOf('docker compose --profile backend up -d backend')
    expect(syncRun).toBeGreaterThan(-1)
    expect(syncRun).toBeLessThan(appUp)
  })

  it('writes /opt/app/.env and the manifest with mode 600', () => {
    const out = renderCloudInit(params())
    expect(out).toMatch(/chmod 600 \/opt\/app\/\.env/)
    expect(out).toMatch(/chmod 600 \/etc\/runtime-secrets\/manifest\.json/)
    expect(out).toMatch(/os\.chmod\(RUNTIME_ENV_PATH, 0o600\)/)
  })

  it('logs into the registry host (not the full namespaced ref) via --password-stdin', () => {
    const out = renderCloudInit(params())
    expect(out).toContain("echo 'SCW-SECRET-KEY' | docker login rg.fr-par.scw.cloud -u nologin --password-stdin")
    expect(out).not.toMatch(/docker login[^\n]*-p\s+\$/)
  })

  it('can skip Docker installation when the VM image is pre-baked', () => {
    const out = renderCloudInit(params({ dockerPreinstalled: true }))
    expect(out).not.toContain('apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin')
    expect(out).toContain('docker compose --profile backend pull backend')
  })

  it('embeds the compose and env bodies in their heredocs', () => {
    const out = renderCloudInit(params())
    expect(out).toContain('services:\n  backend: {}')
    expect(out).toContain('BACKEND_URL=https://api.example.test')
  })

  it('does not corrupt Python newline literals in the runtime secret sync script', () => {
    const out = renderCloudInit(params())
    expect(out).toContain('if chr(10) in value or chr(13) in value:')
    expect(out).toContain('payload = chr(10).join(lines)')
  })

  it('keeps the runtime secret sync helper testable outside the bash template', () => {
    expect(runtimeSecretSyncScript).toContain("MANIFEST_PATH = pathlib.Path('/etc/runtime-secrets/manifest.json')")
    expect(runtimeSecretSyncScript).toContain("RUNTIME_ENV_PATH = pathlib.Path('/opt/app/.env.runtime')")
    expect(runtimeSecretSyncScript).toContain("os.chmod(RUNTIME_ENV_PATH, 0o600)")
  })

  it('starts the app binding the host port directly (no ingress proxy)', () => {
    const out = renderCloudInit(params())
    expect(out).toContain('docker compose --profile backend up -d backend')
    expect(out).not.toContain('ingress')
    expect(out).not.toContain('__ingress/health')
  })
})
