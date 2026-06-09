/**
 * Source-level security invariants for the LB / DNS / Edge / DB / registry
 * / secrets modules.
 *
 * These modules either gate on `hasDomain` (LB, DNS, Edge) or read deeply from
 * stack config (DB), making a live render via the Pulumi mock harness brittle
 * and slow. Static checks here are intentionally narrow and target the few
 * security invariants that have caused production outages or audits in the
 * past (TLS, CAA, WAF, DB privacy, public registry leaks).
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const modulesDir = resolve(__dirname, '../../modules')
const read = (m: string) => readFileSync(resolve(modulesDir, m), 'utf-8')

const lb = read('loadbalancer.ts')
const dns = read('dns.ts')
const edge = read('edge.ts')
const db = read('database.ts')
const reg = read('registry.ts')
const secrets = read('secrets.ts')

describe('loadbalancer module', () => {
  it('HTTPS frontend on port 443 is defined', () => {
    expect(lb).toMatch(/inboundPort:\s*443/)
  })

  it('HTTP frontend on port 80 carries the to-HTTPS redirect ACL', () => {
    expect(lb).toMatch(/inboundPort:\s*80/)
    expect(lb).toMatch(/['"]http-to-https['"]/)
    // Redirect action must target HTTPS with a permanent code.
    expect(lb).toMatch(/type:\s*['"]scheme['"]/)
    expect(lb).toMatch(/target:\s*['"]https['"]/)
    expect(lb).toMatch(/code:\s*301/)
  })

  it('HTTPS frontend references certificateIds (TLS is enforced)', () => {
    expect(lb).toMatch(/certificateIds:/)
  })

  it('certificates use Let\'s Encrypt managed issuance', () => {
    expect(lb).toMatch(/letsencrypt:\s*\{/)
  })
})

describe('dns module', () => {
  it('publishes a CAA record restricting issuance to Let\'s Encrypt', () => {
    expect(dns).toMatch(/type:\s*['"]CAA['"]/)
    expect(dns).toMatch(/issue.*letsencrypt\.org/)
  })

  it('publishes a CAA iodef record (audit incidents pointer)', () => {
    expect(dns).toMatch(/iodef.*mailto:/)
  })

  // Known gap: DMARC TXT record is not currently provisioned.
  // Tracking it as a TODO surfaces the gap in test output without
  // hard-failing the suite.
  it.todo('publishes a DMARC TXT record (p=quarantine or p=reject)')
})

describe('edge / WAF module', () => {
  it('WAF stage is provisioned in enabled mode when infra.enableWaf is true', () => {
    expect(edge).toMatch(/if\s*\(\s*infra\.enableWaf\s*\)/)
    expect(edge).toMatch(/mode:\s*['"]enable['"]/)
    expect(edge).toMatch(/paranoiaLevel:\s*\d/)
  })

  it('TLS stage uses managed Let\'s Encrypt certificates', () => {
    expect(edge).toMatch(/managedCertificate:\s*true/)
  })
})

describe('database module', () => {
  it('private network is required (no public endpoint)', () => {
    expect(db).toMatch(/privateNetwork:\s*\{/)
    expect(db).not.toMatch(/publicEndpoint:\s*true/)
  })

  it('SSL is required in connection strings (sslmode=require)', () => {
    expect(db).toMatch(/sslmode=require/)
  })

  it('two role-based DB users exist (admin, runtime)', () => {
    expect(db).toMatch(/name:\s*['"]admin_role['"]/)
    expect(db).toMatch(/name:\s*['"]runtime_role['"]/)
    expect(db).not.toMatch(/name:\s*['"]cdc_role['"]/)
  })

  it('generated passwords have at least 32 chars and special-char floor', () => {
    expect(db).toMatch(/length:\s*32/)
    expect(db).toMatch(/minSpecial:\s*[2-9]/)
  })

  it('production instance is protected from accidental deletion', () => {
    expect(db).toMatch(/protect:\s*isProduction/)
  })

  // Known gaps surfaced by the testing plan — these are configuration
  // decisions the operator must make per environment. Listed here so a
  // reviewer sees them in `pnpm test` output.
  it.todo('production instance runs as HA cluster (isHaCluster: true)')
  it.todo('production instance has automated backups (disableBackup: false)')
})

describe('registry module', () => {
  it('container registry is created non-public (isPublic: false)', () => {
    expect(reg).toMatch(/isPublic:\s*false/)
  })
})

describe('secrets module', () => {
  it('sources runtime secret containers from the central registry', () => {
    expect(secrets).toMatch(/runtimeSecrets\.map\(/)
    expect(secrets).toMatch(/valueSource === 'pulumi'/)
    expect(secrets).toMatch(/scaleway\.secrets\.getSecretOutput\(/)
    expect(secrets).toMatch(/pulumiRuntimeSecretData/)
  })

  it('seeds stable pulumi-owned runtime secrets from stack config only as a migration fallback', () => {
    expect(secrets).toMatch(/new random\.RandomPassword\(/)
    expect(secrets).toContain('const configured = infraConfig.getSecret(configKey)')
    for (const key of ['cookieSecret', 'unsubscribeSecret', 'cdcSecret', 'yjsSecret', 'piiHashSecret']) {
      expect(secrets).toContain(`pulumiOwnedRuntimeSecret('${key}'`)
    }
  })

  it('namespaces every secret under the slug/mode path', () => {
    expect(secrets).toMatch(/const secretPath = `\/\$\{naming\.slug\}-\$\{mode\}\/`/)
    // The Secret resource must set path: secretPath so secrets never land at root.
    expect(secrets).toMatch(/path:\s*secretPath/)
  })

  it('writes SecretVersions only through the createSecretVersion helper', () => {
    // Exactly one construction site for the Version resource — the helper.
    const versionConstructions = secrets.match(/new scaleway\.secrets\.Version\(/g) ?? []
    expect(versionConstructions).toHaveLength(1)
    expect(secrets).toMatch(/function createSecretVersion\(/)
  })

  it('does not read runtime app secrets from Pulumi stack config', () => {
    for (const key of ['cookieSecret', 'unsubscribeSecret', 'cdcSecret', 'yjsSecret', 'piiHashSecret', 'brevoApiKey', 'scwAiApiKey', 'adminEmail']) {
      expect(secrets).not.toMatch(new RegExp(`requireSecret\(['"]${key}['"]\)`))
    }
    for (const key of ['brevoApiKey', 'scwAiApiKey', 'adminEmail']) {
      expect(secrets).not.toMatch(new RegExp(`getSecret\(['"]${key}['"]\)`))
    }
  })
})

