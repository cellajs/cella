import { describe, expect, it } from 'vitest'
import { generationsByService, selectGeneration } from './sync-rollout-config'

describe('sync rollout config helpers', () => {
  it('groups generations by service', () => {
    const services = generationsByService([
      { service: 'backend', genId: 'aa11', sha: 'old' },
      { service: 'frontend', genId: 'bb22', sha: 'old' },
      { service: 'backend', genId: 'cc33', sha: 'new' },
    ])
    expect(services.get('backend')).toHaveLength(2)
    expect(services.get('frontend')).toHaveLength(1)
  })

  it('selects a single, deterministic generation per service when seeding', () => {
    // On a first provision there is exactly one generation per service; the
    // genId-sorted pick only matters if that invariant is ever broken.
    expect(selectGeneration([{ service: 'frontend', genId: 'bb22', sha: 'old' }])).toEqual({ service: 'frontend', genId: 'bb22', sha: 'old' })
    expect(
      selectGeneration([
        { service: 'backend', genId: 'cc33', sha: 'new' },
        { service: 'backend', genId: 'aa11', sha: 'old' },
      ]),
    ).toEqual({ service: 'backend', genId: 'aa11', sha: 'old' })
  })
})