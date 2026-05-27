/**
 * Source-level security smoke tests for `infra/modules/compute.ts`.
 *
 * compute.ts is hard to render with the Pulumi mock harness (cascading
 * requireSecret + image-tag pin guard + cross-module imports), so the most
 * valuable invariants are verified by static analysis of the file text.
 * These assertions catch regressions like "someone added an SSH ingress rule"
 * or "someone dropped the secret-scrubbing sed line".
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(__dirname, '../../modules/compute.ts'), 'utf-8')

describe('compute module source invariants', () => {
  it('SecurityGroup defaults to drop on ingress', () => {
    expect(source).toMatch(/inboundDefaultPolicy:\s*['"]drop['"]/)
  })

  it('SecurityGroup ingress rules list is empty', () => {
    expect(source).toMatch(/inboundRules:\s*\[\s*\]/)
  })

  it('does not open SSH (port 22) anywhere', () => {
    // No inbound port 22 / "22" rule strings.
    expect(source).not.toMatch(/port:\s*22\b/)
    expect(source).not.toMatch(/['"]ssh['"]/i)
  })

  it('reads every app secret via requireSecret (no plain require for known secret keys)', () => {
    const secretKeys = [
      'cookieSecret',
      'unsubscribeSecret',
      'cdcSecret',
      'yjsSecret',
      'brevoApiKey',
      'scwAiApiKey',
      'adminEmail',
    ]
    for (const k of secretKeys) {
      const requireSecretPattern = new RegExp(`requireSecret\\(\\s*['"]${k}['"]\\s*\\)`)
      const plainRequirePattern = new RegExp(`infraConfig\\.require\\(\\s*['"]${k}['"]\\s*\\)`)
      expect(source, `${k} must use requireSecret`).toMatch(requireSecretPattern)
      expect(source, `${k} must NOT be loaded via plain require`).not.toMatch(plainRequirePattern)
    }
  })

  it('scaleway:secretKey is loaded as a secret (not require)', () => {
    expect(source).toMatch(/Config\(['"]scaleway['"]\)\.requireSecret\(['"]secretKey['"]\)/)
  })

  it('cloud-init scrubs secrets from cloud-init logs', () => {
    expect(source).toMatch(/sed -i.*SECRET.*PASSWORD.*API_KEY.*DATABASE_URL.*cloud-init/s)
  })

  it('cloud-init writes /opt/app/.env with mode 0600', () => {
    expect(source).toMatch(/chmod\s+600\s+\/opt\/app\/\.env/)
  })

  it('registry login uses --password-stdin (no secret on argv)', () => {
    expect(source).toMatch(/docker login[^\n]*--password-stdin/)
    expect(source).not.toMatch(/docker login[^\n]*-p\s+\$/)
  })

  it('all four service profiles are defined (backend, cdc, yjs, ai)', () => {
    for (const profile of ['backend', 'cdc', 'yjs', 'ai']) {
      expect(source).toMatch(new RegExp(`profile:\\s*['"]${profile}['"]`))
    }
  })
})
