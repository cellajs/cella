/**
 * "No unexpected public surface" sweep.
 *
 * Walks every `infra/resources/*.ts` file looking for patterns that widen the
 * public attack surface (open ingress, wildcard CORS, public buckets,
 * Principal:'*' policies, public DB endpoints, public registries). Every match
 * MUST be present in `EXPECTED` below — otherwise the test fails and the
 * reviewer has to either justify the new surface or remove it.
 *
 * This is the cheap, in-repo equivalent of Pulumi's StackValidationArgs policy.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

interface Finding {
  resource: string
  line: number
  text: string
  pattern: string
}

const PATTERNS: Array<{ name: string; rx: RegExp }> = [
  { name: 'principal-wildcard', rx: /Principal['"]\s*:\s*['"]\*['"]/ },
  { name: 'cidr-any-ipv4', rx: /['"]0\.0\.0\.0\/0['"]/ },
  { name: 'cidr-any-ipv6', rx: /['"]::\/0['"]/ },
  { name: 'cors-allowed-origins-wildcard', rx: /allowedOrigins:\s*\[\s*['"]\*['"]/ },
  { name: 'public-bucket-flag', rx: /isPublic:\s*true/ },
  { name: 'public-db-endpoint', rx: /publicEndpoint:\s*true/ },
  { name: 'inbound-accept-default', rx: /inboundDefaultPolicy:\s*['"]accept['"]/ },
]

// Allowlist: every entry MUST be justified by a real, intentional public
// surface. Keep this list short. Format: `<resource>:<pattern-name>`.
const EXPECTED = new Set<string>([
  // Frontend SPA bucket — served by the Caddy frontend VM, must be readable.
  'storage.ts:principal-wildcard',
  // Public-uploads bucket — user-uploaded assets meant to be public.
  // (Same resource, same pattern — counted once because we dedupe per resource.)
])

const resourcesDir = resolve(__dirname, '../../resources')

function scan(): Finding[] {
  const findings: Finding[] = []
  for (const file of readdirSync(resourcesDir)) {
    if (!file.endsWith('.ts')) continue
    const src = readFileSync(resolve(resourcesDir, file), 'utf-8')
    const lines = src.split('\n')
    for (let i = 0; i < lines.length; i++) {
      for (const p of PATTERNS) {
        if (p.rx.test(lines[i])) {
          findings.push({ resource: file, line: i + 1, text: lines[i].trim(), pattern: p.name })
        }
      }
    }
  }
  return findings
}

describe('no-unexpected-public sweep', () => {
  it('every public-surface pattern is in the EXPECTED allowlist', () => {
    const findings = scan()
    const keys = new Set(findings.map((f) => `${f.resource}:${f.pattern}`))

    const unexpected: string[] = []
    for (const k of keys) {
      if (!EXPECTED.has(k)) {
        const occurrences = findings.filter((f) => `${f.resource}:${f.pattern}` === k)
        unexpected.push(
          `  ${k}:\n` + occurrences.map((o) => `    ${o.resource}:${o.line}  ${o.text}`).join('\n'),
        )
      }
    }

    if (unexpected.length > 0) {
      throw new Error(
        `Found ${unexpected.length} unexpected public-surface pattern(s).\n` +
          'Either remove the public surface or add the key to EXPECTED with a justification comment.\n\n' +
          unexpected.join('\n\n'),
      )
    }
  })

  it('does not flag pristine surface — sanity check the scanner itself runs', () => {
    // If PATTERNS array got accidentally emptied, this test catches it.
    expect(PATTERNS.length).toBeGreaterThan(0)
    // And ensure we're actually scanning resources.
    expect(readdirSync(resourcesDir).some((f) => f.endsWith('.ts'))).toBe(true)
  })
})
