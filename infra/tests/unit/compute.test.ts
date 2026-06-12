/**
 * Source-level security smoke tests for `infra/resources/compute.ts`.
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

const source = readFileSync(resolve(__dirname, '../../resources/compute.ts'), 'utf-8')

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

  it('uses VM reader credentials (vmAccessKey/vmSecretKey) from helpers, not the operator scaleway key', () => {
    // The VM identity is a minimal-privilege `<slug>-vm-reader` application
    // (ContainerRegistryReadOnly + ObjectStorageReadOnly + SecretManagerReadOnly
    // + SecretManagerSecretAccess).
    // compute.ts must source its credentials from the infra helpers, never by
    // reading `new pulumi.Config('scaleway').requireSecret(...)` directly.
    expect(source).toMatch(/vmAccessKey|vmSecretKey/)
    expect(source).not.toMatch(/Config\(['"]scaleway['"]\)\.requireSecret\(['"]secretKey['"]\)/)
    expect(source).not.toMatch(/Config\(['"]scaleway['"]\)\.requireSecret\(['"]accessKey['"]\)/)
  })

  it('cloud-init render is delegated to the cloud-init module', () => {
    // The boot-script text lives in resources/cloud-init.ts and is verified
    // against its rendered output in resources/cloud-init.test.ts. compute.ts
    // must keep wiring buildCloudInit through renderCloudInit.
    expect(source).toMatch(/renderCloudInit\(/)
  })

  it('sizes each VM via the per-service instanceTypeFor helper', () => {
    // VM size must be resolved per service (so backend can run a bigger box
    // for blue-green 2x-RAM cutover) rather than the fleet-wide infra.instanceType.
    expect(source).toMatch(/type:\s*infra\.instanceTypeFor\(service\.name\)/)
    expect(source).not.toMatch(/type:\s*infra\.instanceType\b/)
  })

  it('derives the VM service list from the canonical registry (enabledServices)', () => {
    // compute filters the canonical registry by feature flag rather than
    // re-declaring the service set, so LB / deploy-tags / reconciler can't drift.
    expect(source).toMatch(/enabledServices\(appConfig\.has\)/)
  })

  it('binds compose env from the registry placeholder scan + bindings + envPool (no per-service env maps)', () => {
    // Per-service compose env is derived by scanning each service's compose
    // blocks for ${VAR} placeholders, bound from the registry's `bindings`
    // templates first and the shared envPool second, so adding a service never
    // requires a compute.ts edit unless it introduces a genuinely new
    // Pulumi-bound value.
    expect(source).toMatch(/const envPool:/)
    expect(source).toMatch(/composePlaceholders\(/)
    expect(source).toMatch(/block\.profiles\.includes\(/)
    expect(source).toMatch(/svc\.bindings\?\.\[name\]/)
    expect(source).toMatch(/resolveBinding\(/)
    // Unknown placeholders must fail fast rather than booting a broken VM.
    expect(source).toMatch(/defines a value for it/)
    // The old hand-maintained per-service map must not come back.
    expect(source).not.toMatch(/composeEnvFor/)
  })

  it('contains no service-specific wiring — inter-service topology lives in registry bindings', () => {
    // cdc's API_WS_URL and ai's AI_API_URL are declared as @{…} binding
    // templates in compose/services.config.ts; compute.ts only provides the
    // generic resolver (url / privateIp / port vocabulary).
    for (const banned of ['cdc', "'ai'", 'API_WS_URL', 'AI_API_URL', 'aiUrl']) {
      expect(source, `service-specific token ${banned} must not appear in compute.ts`).not.toContain(banned)
    }
  })

  it('reserves private IPs in a first pass so bindings have no VM creation-order constraints', () => {
    expect(source).toMatch(/reservedIps\.set\(/)
    expect(source).toMatch(/reservedPrivateIp\(/)
    // The old backend-first special case must not come back.
    expect(source).not.toMatch(/Create backend first/)
  })

  it('derives the ingress boot slot from the registry rollover strategy', () => {
    expect(source).toMatch(/rolloverStrategy === 'blue-green'/)
    expect(source).not.toMatch(/name === 'backend'\s*\?\s*'backend-blue'/)
  })

  it('envPool does not bind backend secrets as compose env values', () => {
    // The .env file is still mounted via env_file: .env, but secrets travel via
    // the runtime-secrets manifest — never as envPool compose values.
    const poolBlock = source.match(/const envPool:[\s\S]*?\n\}/)
    expect(poolBlock, 'could not locate envPool').not.toBeNull()
    const body = poolBlock?.[0] ?? ''
    for (const banned of ['DATABASE_URL', 'COOKIE_SECRET', 'BREVO_API_KEY', 'SCW_AI_API_KEY', 'YJS_SECRET', 'CDC_SECRET']) {
      expect(body, `${banned} must not appear in envPool`).not.toContain(banned)
    }
  })

  it('passes a runtime secret manifest into cloud-init instead of inlining runtime values into .env', () => {
    expect(source).toMatch(/runtimeSecretsManifest,/)
    expect(source).not.toContain('COOKIE_SECRET=')
    expect(source).not.toContain('DATABASE_URL=')
    expect(source).not.toContain('BREVO_API_KEY=')
  })
})
