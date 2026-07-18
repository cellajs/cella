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
})
