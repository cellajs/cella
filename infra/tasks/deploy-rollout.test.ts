import { describe, expect, it } from 'vitest'
import { buildWavedPlan, main, parseArgs } from './deploy-rollout'

describe('deploy-rollout parseArgs', () => {
  it('parses primary and rest rollout matrices', () => {
    const primary = JSON.stringify([{ service: 'backend', health_url: 'https://api' }])
    const rest = JSON.stringify([{ service: 'cdc', health_url: '' }, { service: 'frontend', health_url: 'https://app' }])
    expect(parseArgs(['--stack', 'production', '--sha', 'abc123', '--primary-json', primary, '--rest-json', rest])).toEqual({
      stack: 'production',
      sha: 'abc123',
      primary: [{ service: 'backend', health_url: 'https://api' }],
      rest: [{ service: 'cdc', health_url: '' }, { service: 'frontend', health_url: 'https://app' }],
    })
  })

  it('throws when required flags are missing', () => {
    expect(() => parseArgs(['--stack', 'production'])).toThrow(/Usage/)
  })
})

describe('buildWavedPlan', () => {
  it('resolves registry-backed plans with normalized health URLs', () => {
    const plan = buildWavedPlan({
      sha: 'abc123',
      primary: [{ service: 'backend', health_url: 'https://api' }],
      rest: [{ service: 'cdc', health_url: '' }, { service: 'frontend', health_url: 'https://app' }],
    })
    expect(plan.primary).toMatchObject({ service: 'backend', strategy: 'lb-overlap', drainSeconds: 10, healthUrl: 'https://api/health' })
    expect(plan.rest[0]).toMatchObject({ service: 'cdc', strategy: 'exclusive' })
    expect(plan.rest[1]).toMatchObject({ service: 'frontend', strategy: 'lb-overlap', healthUrl: 'https://app/health' })
  })

  it('rejects more than one primary service', () => {
    expect(() =>
      buildWavedPlan({
        sha: 'abc123',
        primary: [
          { service: 'backend', health_url: 'https://api' },
          { service: 'frontend', health_url: 'https://app' },
        ],
        rest: [],
      }),
    ).toThrow(/at most one primary/)
  })

  it('rejects an unknown service', () => {
    expect(() => buildWavedPlan({ sha: 'abc123', primary: [], rest: [{ service: 'nope', health_url: '' }] })).toThrow(/Unknown service/)
  })
})

describe('deploy-rollout main', () => {
  it('refuses non-pinned image tags before touching any runtime', async () => {
    const makeRuntime = () => {
      throw new Error('runtime should not be constructed')
    }
    const argv = ['--stack', 'production', '--sha', 'latest', '--primary-json', '[]', '--rest-json', '[]']
    await expect(main(argv, makeRuntime)).rejects.toThrow(/non-pinned/)
  })
})
