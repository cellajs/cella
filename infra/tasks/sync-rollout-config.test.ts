import { describe, expect, it } from 'vitest';
import { generationsByService, seedCandidates, selectGeneration, staleActiveServices } from './sync-rollout-config';

describe('sync rollout config helpers', () => {
  it('groups generations by service', () => {
    const services = generationsByService([
      { service: 'backend', genId: 'aa11', sha: 'old' },
      { service: 'frontend', genId: 'bb22', sha: 'old' },
      { service: 'backend', genId: 'cc33', sha: 'new' },
    ]);
    expect(services.get('backend')).toHaveLength(2);
    expect(services.get('frontend')).toHaveLength(1);
  });

  it('selects a single, deterministic generation per service when seeding', () => {
    // On a first provision there is exactly one generation per service; the
    // The genId-sorted pick only matters if that assumption stops holding.
    expect(selectGeneration([{ service: 'frontend', genId: 'bb22', sha: 'old' }])).toEqual({ service: 'frontend', genId: 'bb22', sha: 'old' });
    expect(
      selectGeneration([
        { service: 'backend', genId: 'cc33', sha: 'new' },
        { service: 'backend', genId: 'aa11', sha: 'old' },
      ]),
    ).toEqual({ service: 'backend', genId: 'aa11', sha: 'old' });
  });

  it('ignores pre-migration metadata that has no genId (never seeds active.id = undefined)', () => {
    // Numeric-gen stack output (old shape) carries no genId. Seeding from it
    // corrupted the control object, so these items must be filtered out.
    const seeds = seedCandidates([
      { service: 'backend', sha: '9fe4' } as never,
      { service: 'frontend', genId: '', sha: '9fe4' } as never,
      { service: 'cdc', genId: 'cc33', sha: '9fe4' },
    ]);
    expect(seeds.has('backend')).toBe(false);
    expect(seeds.has('frontend')).toBe(false);
    expect(seeds.get('cdc')).toEqual({ service: 'cdc', genId: 'cc33', sha: '9fe4' });
  });

  it('flags an active pointer whose VM the stack no longer has', () => {
    // The 0.13.0 shape: the update that created ba1d also destroyed the promoted f9a8.
    const rollout = { backend: { seq: 3, pendingSha: 'new', active: { id: 'f9a8', sha: 'old', seq: 3 } } };
    expect(staleActiveServices(rollout, [{ service: 'backend', genId: 'ba1d', sha: 'new' }])).toEqual(['backend']);
  });

  it('keeps a live active pointer and one for a service the stack runs no generation of', () => {
    const rollout = {
      backend: { seq: 3, active: { id: 'f9a8', sha: 'old', seq: 3 } },
      cdc: { seq: 2, active: { id: 'c0de', sha: 'old', seq: 2 } },
      frontend: { seq: 1 },
    };
    const live = [
      { service: 'backend' as const, genId: 'f9a8', sha: 'old' },
      { service: 'backend' as const, genId: 'ba1d', sha: 'new' },
    ];
    expect(staleActiveServices(rollout, live)).toEqual([]);
  });
});
