/**
 * Static checks on the deploy-tags module — same pattern as module-invariants.
 * Lives separately so the test surface stays focused on the cutover contract.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const src = readFileSync(resolve(__dirname, '../../modules/deploy-tags.ts'), 'utf-8')

describe('deploy-tags module', () => {
  it('seeds one tag object per service', () => {
    for (const svc of ['backend', 'cdc', 'yjs', 'ai', 'frontend']) {
      expect(src, `missing seed for service '${svc}'`).toContain(`deploy/${svc}.tag`)
    }
  })

  it('seeded objects ignore content/etag/hash so pulumi up never reverts CI writes', () => {
    expect(src).toMatch(/ignoreChanges:\s*\[\s*['"]content['"],\s*['"]etag['"],\s*['"]hash['"]\s*\]/)
  })

  it('bootstrap placeholder content is the literal string `bootstrap`', () => {
    // The reconciler shell script checks for this exact value as a no-op.
    expect(src).toContain("content: 'bootstrap'")
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
