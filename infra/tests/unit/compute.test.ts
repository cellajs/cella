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

  it('builds per-service runtime secret manifests instead of loading app secrets from stack config', () => {
    expect(source).toMatch(/buildRuntimeSecretsManifest\(/)
    expect(source).toMatch(/runtimeSecretsForConsumer\(/)
    expect(source).toMatch(/secretIds\[definition\.id\]/)
    for (const key of ['cookieSecret', 'unsubscribeSecret', 'cdcSecret', 'yjsSecret', 'piiHashSecret', 'brevoApiKey', 'scwAiApiKey', 'adminEmail']) {
      expect(source).not.toMatch(new RegExp(`requireSecret\\(\\s*['"]${key}['"]\\s*\\)`))
    }
  })

  it('scaleway:secretKey is loaded as a secret (not require)', () => {
    expect(source).toMatch(/Config\(['"]scaleway['"]\)\.requireSecret\(['"]secretKey['"]\)/)
  })

  it('cloud-init render is delegated to the cloud-init module', () => {
    // The boot-script text lives in modules/cloud-init.ts and is verified
    // against its rendered output in modules/cloud-init.test.ts. compute.ts
    // must keep wiring buildCloudInit through renderCloudInit.
    expect(source).toMatch(/renderCloudInit\(/)
  })

  it('sizes each VM via the per-service instanceTypeFor helper', () => {
    // VM size must be resolved per service (so backend can run a bigger box
    // for blue-green 2x-RAM cutover) rather than the fleet-wide infra.instanceType.
    expect(source).toMatch(/type:\s*infra\.instanceTypeFor\(service\.name\)/)
    expect(source).not.toMatch(/type:\s*infra\.instanceType\b/)
  })

  it('all five service profiles are defined (backend, cdc, yjs, ai, frontend)', () => {
    for (const profile of ['backend', 'cdc', 'yjs', 'ai', 'frontend']) {
      expect(source).toMatch(new RegExp(`profile:\\s*['"]${profile}['"]`))
    }
  })

  it('frontend service does not receive backend secrets through composeEnv', () => {
    // The .env file is still mounted via env_file: .env, but the frontend
    // profile must not surface DB creds / cookie secrets / API keys via
    // explicit composeEnv keys. This guards against accidental cross-wiring.
    const frontendBlock = source.match(/name:\s*'frontend',[\s\S]*?\}\s*,?\s*\]/)
    expect(frontendBlock, 'could not locate frontend service block').not.toBeNull()
    const body = frontendBlock?.[0] ?? ''
    for (const banned of ['DATABASE_URL', 'COOKIE_SECRET', 'BREVO_API_KEY', 'SCW_AI_API_KEY', 'YJS_SECRET', 'CDC_SECRET']) {
      expect(body, `${banned} must not appear in frontend composeEnv`).not.toContain(banned)
    }
  })

  it('passes a runtime secret manifest into cloud-init instead of inlining runtime values into .env', () => {
    expect(source).toMatch(/runtimeSecretsManifest,/)
    expect(source).not.toContain('COOKIE_SECRET=')
    expect(source).not.toContain('DATABASE_URL=')
    expect(source).not.toContain('BREVO_API_KEY=')
  })
})
