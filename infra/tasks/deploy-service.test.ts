import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(__dirname, 'deploy-service.ts'), 'utf-8')

describe('deploy-service source invariants', () => {
  it('keeps public deploy health gates short enough to fail fast', () => {
    expect(source).toMatch(/const deployHealthAttempts = 30/)
    expect(source).toMatch(/attempts: deployHealthAttempts/)
  })
})