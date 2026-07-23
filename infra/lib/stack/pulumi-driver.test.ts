import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCliDriver, createPulumiDriver } from './pulumi-driver'

afterEach(() => {
  delete process.env.INFRA_PULUMI_DRIVER
})

describe('createCliDriver', () => {
  it('updates without a preview pass and reads outputs as JSON', async () => {
    const calls: string[][] = []
    const exec = vi.fn((args: string[]) => {
      calls.push(args)
      return args[0] === 'stack' ? '{"backend":"bid-1"}' : ''
    })
    const driver = createCliDriver('production', exec)
    await driver.update()
    expect(calls[0]).toEqual(['up', '--stack', 'production', '--yes', '--non-interactive', '--skip-preview'])
    await expect(driver.output('lbBackendIds')).resolves.toEqual({ backend: 'bid-1' })
    expect(calls[1]).toEqual(['stack', 'output', 'lbBackendIds', '--stack', 'production', '--json'])
  })
})

describe('createPulumiDriver selection', () => {
  it('defaults to the CLI driver', () => {
    expect(createPulumiDriver('production').kind).toBe('cli')
  })

  it('selects the Automation API driver via INFRA_PULUMI_DRIVER', () => {
    process.env.INFRA_PULUMI_DRIVER = 'automation'
    expect(createPulumiDriver('production').kind).toBe('automation')
  })
})
