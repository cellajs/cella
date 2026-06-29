import { describe, expect, it } from 'vitest'
import { parseBootPlanJson } from './plan'

function plan(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schemaVersion: 1,
    service: 'backend',
    profile: 'backend',
    releaseSha: 'abc123',
    imageContract: 'docker-node-agent-v1',
    registry: 'rg.nl-ams.scw.cloud/ns',
    region: 'nl-ams',
    credentials: { scwAccessKeyFile: '/etc/cella/scw-access-key', scwSecretKeyFile: '/etc/cella/scw-secret-key' },
    bootDiagnostics: { bucket: 'cella-boot-diag', logFile: '/var/log/cella-boot.log' },
    releaseCommand: { enabled: true, command: ['docker', 'compose', 'run', 'migrate'] },
    docker: { composeFile: '/opt/app/compose.yml' },
    files: { compose: 'services: {}', env: 'BACKEND_TAG=abc', runtimeSecretManifest: [{ envVar: 'COOKIE_SECRET', secretId: 'uuid', required: true }] },
    timeouts: { privateNetworkSeconds: 150, pullAttempts: 2, pullRetrySeconds: 1 },
    ...overrides,
  })
}

describe('parseBootPlanJson', () => {
  it('parses a valid schema-v1 boot plan', () => {
    expect(parseBootPlanJson(plan()).service).toBe('backend')
  })

  it('rejects unsupported schema and image contract', () => {
    expect(() => parseBootPlanJson(plan({ schemaVersion: 2 }))).toThrow(/unsupported schemaVersion/)
    expect(() => parseBootPlanJson(plan({ imageContract: 'docker-only' }))).toThrow(/unsupported imageContract/)
  })

  it('rejects unknown top-level fields', () => {
    expect(() => parseBootPlanJson(plan({ surprise: true }))).toThrow(/unknown top-level field/)
  })

  it('rejects empty release commands', () => {
    expect(() => parseBootPlanJson(plan({ releaseCommand: { enabled: true, command: [] } }))).toThrow(/non-empty command array/)
    expect(() => parseBootPlanJson(plan({ releaseCommand: { enabled: true, command: ['docker', ''] } }))).toThrow(/empty or non-string/)
  })

  it('rejects paths outside allowed boot locations', () => {
    expect(() => parseBootPlanJson(plan({ docker: { composeFile: '/tmp/compose.yml' } }))).toThrow(/outside the allowed/)
  })
})
