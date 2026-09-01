import { describe, expect, it } from 'vitest';
import { setEngineConfig } from '../config/engine-config';
import { fakeConfig } from '../tests/helpers/fake-config';
import { planForService } from './rollout-plans';

// planForService reads the engine config at call time; inject the fixture.
setEngineConfig(fakeConfig());

describe('planForService', () => {
  it('builds a start-first plan with normalized health URL and internal-pool repoint', () => {
    const plan = planForService('backend', 'https://www.cellajs.com/api');
    expect(plan).toMatchObject({
      service: 'backend',
      strategy: 'start-first',
      drainPolicy: 'requests',
      drainSeconds: 10,
      healthUrl: 'https://www.cellajs.com/api/health',
    });
    // backend declares internalRoute, so its internal LB pool follows the cutover.
    expect(plan.repointBackendKeys).toContain('backend-internal');
  });

  it('builds an exclusive plan without LB requirements', () => {
    const plan = planForService('cdc');
    expect(plan.strategy).toBe('stop-first');
    expect(plan.healthUrl).toBeUndefined();
    expect(plan.exclusive).toBeUndefined();
  });

  it('marks the singleVM host exclusive with nothing to drain (its stop-first worker folds in)', () => {
    setEngineConfig(fakeConfig({ singleVM: true }));
    try {
      const plan = planForService('backend', 'https://www.cellajs.com/api');
      expect(plan).toMatchObject({ strategy: 'start-first', exclusive: true, drainSeconds: 0 });
      expect(plan.healthUrl).toBe('https://www.cellajs.com/api/health');
    } finally {
      setEngineConfig(fakeConfig());
    }
  });

  it('requires a health URL for start-first services', () => {
    expect(() => planForService('frontend')).toThrow(/health URL/);
  });

  it('rejects unknown services', () => {
    expect(() => planForService('nope')).toThrow(/Unknown service/);
  });
});
