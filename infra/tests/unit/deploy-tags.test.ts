/**
 * Static checks on the deploy-tags module — same pattern as module-invariants.
 * Lives separately so the test surface stays focused on the cutover contract.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const src = readFileSync(resolve(__dirname, '../../modules/deploy-tags.ts'), 'utf-8')

describe('deploy-tags module', () => {
  it('exports the deploy/<service>.tag key for every service', () => {
    for (const svc of ['backend', 'cdc', 'yjs', 'ai', 'frontend']) {
      expect(src, `missing tag key for service '${svc}'`).toContain(`deploy/${svc}.tag`)
    }
  })

  it('does NOT seed placeholder objects — CI creates the tag on first roll', () => {
    // The old design created a `scaleway.object.Item` per service with
    // placeholder content then disowned it via ignoreChanges. Readers now
    // treat an ABSENT object as "no release yet", so there must be no seeding.
    expect(src).not.toContain('new scaleway.object.Item')
    expect(src).not.toContain("content: 'bootstrap'")
  })

  it('bucket policy grants CI PutObject only on deploy/*', () => {
    expect(src).toContain("Sid: 'CIWriteTags'")
    expect(src).toMatch(/Action:\s*\[\s*['"]s3:PutObject['"]/)
    expect(src).toMatch(/Resource:\s*\[pulumi\.interpolate`\$\{deployTagsBucket\.name\}\/deploy\/\*`\]/)
  })

  it('bucket policy grants VMs read-only on deploy/*', () => {
    expect(src).toContain("Sid: 'VMReadTags'")
    expect(src).toMatch(/Action:\s*\[\s*['"]s3:GetObject['"],\s*['"]s3:ListBucket['"]/)
  })

  it('production bucket is protected against accidental destroy', () => {
    expect(src).toContain('protect: isProduction')
    expect(src).toContain('forceDestroy: !isProduction')
  })

  it('versioning is disabled (rollback is via re-pushing the previous SHA)', () => {
    expect(src).toMatch(/versioning:\s*\{\s*enabled:\s*false\s*\}/)
  })
})
