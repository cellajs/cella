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
    // (ContainerRegistryReadOnly + SecretManagerReadOnly + SecretManagerSecretAccess).
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
    // VM size must be resolved per service rather than a single fleet-wide size.
    expect(source).toMatch(/type:\s*infra\.instanceTypeFor\(svc\.slug\)/)
    expect(source).not.toMatch(/type:\s*infra\.instanceType\b/)
  })

  it('uses the configured compute image and delegates boot inputs to cloud-init', () => {
    expect(source).toMatch(/image:\s*computeImageId/)
    // The marketplace label / UUID is passed straight through — no plan-time getImage lookup.
    expect(source).toMatch(/const computeImageId:\s*pulumi\.Input<string>\s*=\s*infra\.computeImage/)
    expect(source).not.toMatch(/getImageOutput/)
    expect(source).toMatch(/bootDiagBucket,/)
    expect(source).not.toMatch(/dockerPreinstalled:/)
    expect(source).not.toMatch(/image:\s*'ubuntu_noble'/)
  })

  it('derives the VM service list from the canonical registry (deployedServices)', () => {
    // compute filters the canonical registry by feature flag (and folds
    // co-hosted workers into the host under singleVM) rather than re-declaring
    // the service set, so LB / image-wait / compose wiring can't drift.
    expect(source).toMatch(/deployedServices\(appConfig\.services, appConfig\.singleVM\)/)
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

  it('contains no inter-service env wiring — service topology lives in registry bindings', () => {
    // cdc's API_WS_URL and mcp's MCP_API_URL are declared as @{…} binding
    // templates in config/services.config.ts; compute.ts only provides the
    // generic resolver. The backend IS named (it exposes the one stable
    // internal address the resolver targets), but no service's ENV wiring may
    // be hard-coded here.
    for (const banned of ['API_WS_URL', 'MCP_API_URL', 'mcpUrl']) {
      expect(source, `inter-service env token ${banned} must not appear in compute.ts`).not.toContain(banned)
    }
  })

  it('materialises a VM per active generation with its own per-generation IPs', () => {
    // The immutable-node model names VMs `vm-<svc>-<genId>` (content-addressed)
    // and gives each generation its own public + private IP; the LB targets the
    // set of active generation IPs. There is no lifelong per-service reserved IP map.
    expect(source).toMatch(/activeGenerations\(/)
    expect(source).toMatch(/vm-\$\{svc\.slug\}-\$\{generation\.id\}/)
    expect(source).toMatch(/ipam-\$\{svc\.slug\}-\$\{generation\.id\}/)
    // The old lifelong reserved-IP map must not come back.
    expect(source).not.toMatch(/reservedIps\.set\(/)
    expect(source).not.toMatch(/Create backend first/)
  })

  it('treats both cloud-init and the base image as immutable generation identity', () => {
    // A generation VM fixes its cloud-init AND its image at creation. A marketplace
    // label can resolve to a rotated UUID over time; without ignoring `image`, the
    // base `pulumi up` would diff every running generation and destructively replace
    // the live frontend/backend/cdc VMs (delete-before-create, bypassing the
    // LB-overlap cutover) — the cause of the recurring fleet-wide downtime. A new
    // image is only ever picked up by a NEW generation (new resource name).
    expect(source).toMatch(/ignoreChanges: \['cloudInit', 'image'\]/)
  })

  it('resolves cdc\u2019s @{backend.privateIp} binding to the current backend generation IP', () => {
    // cdc binds to the live backend generation's private IP, baked at deploy
    // time. Backend rolls before cdc, so cdc always bakes the freshly promoted
    // generation \u2014 no moving stable IP, no NIC mutation.
    expect(source).toMatch(/currentGenBindingIp\(/)
    expect(source).toMatch(/generationsByService\.get\(slug\)\?\.\[0\]/)
    // The stable-IP machinery must not come back.
    expect(source).not.toMatch(/stableBindingIp\(/)
    expect(source).not.toMatch(/stableInternalGen_/)
    expect(source).not.toMatch(/stablePrivateIp/)
    expect(source).toMatch(/deleteBeforeReplace: true/)
    expect(source).toMatch(/content-addressed id for a pending SHA/)
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

  it('bakes the runtime secret manifest inline into cloud-init, not as an out-of-band S3 object', () => {
    // Under immutable releases every change replaces the VM anyway, so the
    // manifest (metadata only) is baked into the new generation's cloud-init
    // rather than published as a deploy-bucket object the VM fetches.
    expect(source).toMatch(/buildRuntimeSecretsManifest\(service\.secretConsumers\)/)
    expect(source).not.toMatch(/new scaleway\.object\.Item\(`runtime-manifest-/)
    expect(source).not.toMatch(/runtimeSecretsManifestKey/)
    expect(source).not.toContain('COOKIE_SECRET=')
    expect(source).not.toContain('DATABASE_URL=')
    expect(source).not.toContain('BREVO_API_KEY=')
  })
})
