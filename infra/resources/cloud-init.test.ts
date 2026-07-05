import { describe, expect, it } from 'vitest'
import { type CloudInitParams, renderCloudInit } from './cloud-init'

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
    ...overrides,
  }
}

describe('renderCloudInit', () => {
  it('renders the containerised boot-agent launcher', () => {
    const out = renderCloudInit(params())

    expect(out).toContain('cat > /etc/cella/boot-plan.json')
    expect(out).toContain('"imageContract": "docker-node-agent-v1"')
    expect(out).toContain('cat > /etc/cella/scw-access-key')
    expect(out).toContain('cat > /etc/cella/scw-secret-key')
    expect(out).toContain('cat > /etc/cella/run-agent.sh')
    // Host logs into the registry to pull the agent image, then runs it.
    expect(out).toContain('docker login rg.fr-par.scw.cloud -u nologin --password-stdin < /etc/cella/scw-secret-key')
    expect(out).toContain('docker run --rm --network host')
    expect(out).toContain('-v /var/run/docker.sock:/var/run/docker.sock')
    expect(out).toContain('rg.fr-par.scw.cloud/my-namespace/cella-boot-agent:abc123def')
    expect(out).toContain('boot --plan /etc/cella/boot-plan.json')
    expect(out).toContain('systemctl start cella-boot-agent.service')
    // Enabled so it re-runs on every reboot and re-hydrates runtime secrets.
    expect(out).toContain('systemctl enable cella-boot-agent.service')
  })

  it('passes service boot data through the schema-v1 boot plan', () => {
    const out = renderCloudInit(params())

    expect(out).toContain('"schemaVersion": 1')
    expect(out).toContain('"service": "backend"')
    expect(out).toContain('"profile": "backend"')
    expect(out).toContain('"releaseSha": "abc123def"')
    expect(out).toContain('"registry": "rg.fr-par.scw.cloud/my-namespace"')
    expect(out).toContain('"bucket": "cella-boot-diag"')
    expect(out).toContain('"compose": "services:\\n  backend: {}"')
    expect(out).toContain('"env": "APP_MODE=production\\nBACKEND_TAG=abc123def\\nBACKEND_URL=https://api.example.test"')
    expect(out).toContain('"envVar": "COOKIE_SECRET"')
  })

  it('gates the migrate companion through the agent boot plan', () => {
    const withMigrate = renderCloudInit(params({ runMigrate: true }))
    const withoutMigrate = renderCloudInit(params({ runMigrate: false }))

    expect(withMigrate).toContain('"enabled": true')
    expect(withMigrate).toContain('"docker",')
    expect(withMigrate).toContain('"migrate"')
    expect(withoutMigrate).toContain('"enabled": false')
  })

  it('does not contain legacy boot implementation details', () => {
    const out = renderCloudInit(params())

    expect(out).not.toContain('/usr/local/bin/runtime-secret-sync')
    expect(out).not.toContain('docker compose --profile backend up -d backend')
    expect(out).not.toContain('apt-get install -y -qq docker-ce')
    expect(out).not.toContain('#!/usr/bin/env python3')
    expect(out).not.toContain('urllib.request')
    expect(out).not.toContain('/usr/local/bin/cella-upload-boot-diag')
  })

  it('emits a log-scrub sed pattern that actually matches secret-bearing lines', () => {
    const out = renderCloudInit(params())

    // The scrub must be an ERE alternation. A plain-BRE `|` (or a `\|` eaten by
    // the TS template literal) matches only the literal joined string and
    // silently scrubs nothing.
    const sedLines = out.split('\n').filter((line) => line.includes('sed') && line.includes('cloud-init'))
    expect(sedLines).toHaveLength(2)
    for (const line of sedLines) {
      const pattern = line.match(/'\/(.+)\/Id'/)?.[1]
      expect(pattern, `no sed address in: ${line}`).toBeTruthy()
      expect(line).toContain('-E')
      const re = new RegExp(pattern as string, 'i')
      expect(re.test('docker login rg.fr-par.scw.cloud -u nologin')).toBe(true)
      expect(re.test('export SCW_SECRET_KEY=abc')).toBe(true)
      expect(re.test('DATABASE_URL=postgres://…')).toBe(true)
      expect(re.test('harmless log line')).toBe(false)
    }
  })

  it('renders different userdata when the release SHA changes', () => {
    const a = renderCloudInit(params({ releaseSha: 'sha-a', envFileContent: 'BACKEND_TAG=sha-a' }))
    const b = renderCloudInit(params({ releaseSha: 'sha-b', envFileContent: 'BACKEND_TAG=sha-b' }))
    expect(a).not.toBe(b)
  })
})