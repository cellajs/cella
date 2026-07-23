import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const serviceSource = readFileSync(resolve(__dirname, 'deploy-service.ts'), 'utf-8')
const runtimeSource = readFileSync(resolve(__dirname, 'rollout-runtime.ts'), 'utf-8')

describe('deploy-service source contracts', () => {
  it('supports deferring the reap so deploy-rollout can batch it', () => {
    expect(serviceSource).toMatch(/--skip-reap/)
    expect(serviceSource).toMatch(/if \(!skipReap\) await rt\.update\(\)/)
  })

  it('no longer mutates a stable private IP or reboots during cutover', () => {
    expect(serviceSource).not.toMatch(/reattachInternalIp/)
    expect(serviceSource).not.toMatch(/rebootServer/)
    expect(serviceSource).not.toMatch(/stableInternalGen/)
  })
})

describe('rollout-runtime source contracts', () => {
  it('keeps the public deploy health gate budget above cold-boot time', () => {
    expect(runtimeSource).toMatch(/const deployHealthAttempts = 120/)
    expect(runtimeSource).toMatch(/attempts: deployHealthAttempts/)
  })

  it('skips the redundant preview on rollout stack updates', () => {
    const upCalls = runtimeSource.match(/runPulumi\(\['up'[^\]]*\]\)/g) ?? []
    expect(upCalls.length).toBeGreaterThan(0)
    for (const call of upCalls) expect(call).toContain("'--skip-preview'")
  })
})
