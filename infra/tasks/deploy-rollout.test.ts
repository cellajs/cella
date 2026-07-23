import { describe, expect, it } from 'vitest'
import { main, parseArgs, type RolloutEffects } from './deploy-rollout'

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

function recordingEffects(log: string[], opts: { failOn?: string } = {}): RolloutEffects {
  return {
    deployService: (item) => {
      if (opts.failOn === item.service) throw new Error(`deploy-service failed for ${item.service} with exit 1`)
      log.push(`deploy:${item.service}`)
    },
    reapDisplacedGenerations: (stack) => {
      log.push(`reap:${stack}`)
    },
  }
}

const argvFor = (primary: object[], rest: object[]): string[] => [
  '--stack', 'production', '--sha', 'abc123',
  '--primary-json', JSON.stringify(primary),
  '--rest-json', JSON.stringify(rest),
]

describe('deploy-rollout sequencing', () => {
  it('deploys primary first, then rest in order, then reaps exactly once', async () => {
    const log: string[] = []
    const argv = argvFor(
      [{ service: 'backend', health_url: 'https://api' }],
      [{ service: 'cdc', health_url: '' }, { service: 'frontend', health_url: 'https://app' }],
    )
    await main(argv, recordingEffects(log))
    expect(log).toEqual(['deploy:backend', 'deploy:cdc', 'deploy:frontend', 'reap:production'])
  })

  it('still reaps when there is no primary service', async () => {
    const log: string[] = []
    await main(argvFor([], [{ service: 'frontend', health_url: 'https://app' }]), recordingEffects(log))
    expect(log).toEqual(['deploy:frontend', 'reap:production'])
  })

  it('does not reap when a service deploy fails (displaced generations may still serve)', async () => {
    const log: string[] = []
    const argv = argvFor(
      [{ service: 'backend', health_url: 'https://api' }],
      [{ service: 'frontend', health_url: 'https://app' }],
    )
    await expect(main(argv, recordingEffects(log, { failOn: 'frontend' }))).rejects.toThrow(/frontend/)
    expect(log).toEqual(['deploy:backend'])
    expect(log).not.toContain('reap:production')
  })

  it('rejects more than one primary service', async () => {
    const argv = argvFor(
      [{ service: 'backend', health_url: 'https://api' }, { service: 'mcp', health_url: 'https://mcp' }],
      [],
    )
    await expect(main(argv, recordingEffects([]))).rejects.toThrow(/at most one primary/)
  })
})
