import { describe, expect, it } from 'vitest'
import { scwConfigPathNone } from './bootstrap-scw-env'

describe('scwConfigPathNone', () => {
  it('resolves relative to infraDir', () => {
    expect(scwConfigPathNone('/repo/infra')).toBe('/repo/infra/.scw-config-none')
  })
})
