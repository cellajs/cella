import { describe, expect, it } from 'vitest'
import { createPulumiDriver } from './pulumi-driver'

describe('createPulumiDriver', () => {
  it('exposes the update/output seam without touching the engine until called', () => {
    // Construction must stay side-effect free: the workspace session is
    // resolved lazily so plan-only code paths never spawn a pulumi process.
    const driver = createPulumiDriver('production')
    expect(typeof driver.update).toBe('function')
    expect(typeof driver.output).toBe('function')
  })
})
