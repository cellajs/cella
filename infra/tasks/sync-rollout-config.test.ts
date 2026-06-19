import { describe, expect, it } from 'vitest'
import { generationsByService, selectGeneration } from './sync-rollout-config'

describe('sync rollout config helpers', () => {
  it('selects the newest observed generation per service', () => {
    const services = generationsByService([
      { service: 'backend', gen: 5, sha: 'old' },
      { service: 'frontend', gen: 2, sha: 'old' },
      { service: 'backend', gen: 257, sha: 'new' },
    ])

    expect(selectGeneration(services.get('backend')!)).toEqual({ service: 'backend', gen: 257, sha: 'new' })
    expect(selectGeneration(services.get('frontend')!)).toEqual({ service: 'frontend', gen: 2, sha: 'old' })
  })
})