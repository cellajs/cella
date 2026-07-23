import { describe, expect, it } from 'vitest'
import { planForService } from './rollout-plans'

describe('planForService', () => {
  it('builds an lb-overlap plan with normalized health URL and internal-pool repoint', () => {
    const plan = planForService('backend', 'https://www.cellajs.com/api')
    expect(plan).toMatchObject({
      service: 'backend',
      strategy: 'lb-overlap',
      drainPolicy: 'requests',
      drainSeconds: 10,
      healthUrl: 'https://www.cellajs.com/api/health',
    })
    // backend declares internalRoute, so its internal LB pool follows the cutover.
    expect(plan.repointBackendKeys).toContain('backend-internal')
  })

  it('builds an exclusive plan without LB requirements', () => {
    const plan = planForService('cdc')
    expect(plan.strategy).toBe('exclusive')
    expect(plan.healthUrl).toBeUndefined()
  })

  it('requires a health URL for lb-overlap services', () => {
    expect(() => planForService('frontend')).toThrow(/health URL/)
  })

  it('rejects unknown services', () => {
    expect(() => planForService('nope')).toThrow(/Unknown service/)
  })
})
