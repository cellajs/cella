import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(__dirname, 'deploy-service.ts'), 'utf-8')

describe('deploy-service source contracts', () => {
  it('keeps the public deploy health gate budget above cold-boot time', () => {
    expect(source).toMatch(/const deployHealthAttempts = 120/)
    expect(source).toMatch(/attempts: deployHealthAttempts/)
  })

  it('no longer mutates a stable private IP or reboots during cutover', () => {
    expect(source).not.toMatch(/reattachInternalIp/)
    expect(source).not.toMatch(/rebootServer/)
    expect(source).not.toMatch(/stableInternalGen/)
  })

  it('supports deferred reaps and skips the redundant preview on rollout updates', () => {
    expect(source).toMatch(/--skip-reap/)
    expect(source).toMatch(/if \(!skipReap\) runPulumi/)
    const upCalls = source.match(/runPulumi\(\['up'[^\]]*\]\)/g) ?? []
    expect(upCalls.length).toBeGreaterThan(0)
    for (const call of upCalls) expect(call).toContain("'--skip-preview'")
  })
})
