import { describe, expect, it } from 'vitest'
import { parseArgs } from './deploy-rollout'

describe('deploy-rollout parseArgs', () => {
  it('parses primary and rest rollout matrices', () => {
    const primary = JSON.stringify([{ service: 'backend', health_url: 'https://api' }])
    const rest = JSON.stringify([{ service: 'cdc', health_url: '' }, { service: 'frontend', health_url: 'https://app' }])
    expect(parseArgs(['--stack', 'production', '--sha', 'abc123', '--gen', '42', '--primary-json', primary, '--rest-json', rest])).toEqual({
      stack: 'production',
      sha: 'abc123',
      gen: 42,
      primary: [{ service: 'backend', health_url: 'https://api' }],
      rest: [{ service: 'cdc', health_url: '' }, { service: 'frontend', health_url: 'https://app' }],
    })
  })

  it('throws when required flags are missing', () => {
    expect(() => parseArgs(['--stack', 'production'])).toThrow(/Usage/)
  })
})