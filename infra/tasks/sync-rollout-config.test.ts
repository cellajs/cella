import { describe, expect, it } from 'vitest';
import {
  generationsByService,
  parseReconcileOptions,
  reconcileRollout,
  seedCandidates,
  selectGeneration,
  staleActiveServices,
} from './sync-rollout-config';

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

  it('flags a pointer of a service the config gives a VM when the stack runs none of it', () => {
    // singleVM turned off: cdc boots its own VM again, but its pointer names a VM destroyed when it was folded.
    const rollout = {
      backend: { seq: 3, active: { id: 'f9a8', sha: 'old', seq: 3 } },
      cdc: { seq: 2, active: { id: 'c0de', sha: 'older', seq: 2 } },
    };
    const live = [{ service: 'backend' as const, genId: 'f9a8', sha: 'old' }];
    expect(staleActiveServices(rollout, live, new Set(['backend', 'cdc']))).toEqual(['cdc']);
    expect(staleActiveServices(rollout, live)).toEqual([]);
  });
});

describe('reconcileRollout', () => {
  // The state the failed 0.13.0 deploy left: active names the deleted f9a8, pending names the release whose ba1d VM never passed the gate.
  const afterFailedDeploy = {
    backend: { seq: 3, pendingSha: '84b7e22', active: { id: 'f9a8', sha: 'e9a8d48', seq: 3 } },
    cdc: { seq: 2, active: { id: 'c0de', sha: 'c4a6d59', seq: 2 } },
  };
  const live = [{ service: 'backend' as const, genId: 'ba1d', sha: '84b7e22' }];
  // The deploy's set under singleVM: the host alone boots a VM.
  const reset = { resetPending: true, deployed: ['backend'] } as const;

  it('under resetPending, drops the leftover intent and the dead pointer and adopts the live VM', () => {
    const { rollout, changes } = reconcileRollout(afterFailedDeploy, live, reset);
    expect(rollout.backend).toEqual({ seq: 4, active: { id: 'ba1d', sha: '84b7e22', seq: 4 } });
    expect(changes).toEqual([
      "dropped cdc's rollout entry (active gen=c0de sha=c4a6d59): the config gives it no VM of its own",
      "dropped backend's pending sha=84b7e22: left by a deploy that failed before promotion",
      "dropped backend's active gen=f9a8 sha=e9a8d48: the stack no longer has its VM",
      'seeded backend: active gen=ba1d sha=84b7e22',
    ]);
  });

  it('under resetPending, drops every entry of a service the config gives no VM, pending intent included', () => {
    // Production after the move to singleVM: cdc and frontend kept pointers nothing updates any more.
    const folded = {
      backend: { seq: 9, active: { id: 'ba1d', sha: '79ee6cd', seq: 9 } },
      cdc: { seq: 5, active: { id: 'c0de', sha: 'c4a6d59', seq: 5 } },
      frontend: { seq: 5, pendingSha: '79ee6cd', active: { id: 'f00d', sha: 'c4a6d59', seq: 5 } },
    };
    const { rollout, changes } = reconcileRollout(folded, live, reset);
    expect(rollout).toEqual({ backend: folded.backend });
    expect(changes).toEqual([
      "dropped cdc's rollout entry (active gen=c0de sha=c4a6d59): the config gives it no VM of its own",
      "dropped frontend's rollout entry (active gen=f00d sha=c4a6d59, pending sha=79ee6cd): the config gives it no VM of its own",
    ]);
  });

  it('under resetPending, never adopts a live VM of a service the config no longer deploys', () => {
    // singleVM just turned on: the old cdc VM is still in the stack until the next update reaps it.
    const withOldCdc = [...live, { service: 'cdc' as const, genId: 'c0de', sha: 'c4a6d59' }];
    const { rollout } = reconcileRollout({ backend: { seq: 4, active: { id: 'ba1d', sha: '84b7e22', seq: 4 } } }, withOldCdc, reset);
    expect(rollout).not.toHaveProperty('cdc');
  });

  it('under resetPending, drops a pointer whose service boots a VM again but has none in the stack', () => {
    // singleVM turned off before any deploy dropped the folded pointer: planning it would recreate c0de without minted keys.
    const healthy = {
      backend: { seq: 4, active: { id: 'ba1d', sha: '84b7e22', seq: 4 } },
      cdc: { seq: 2, active: { id: 'c0de', sha: 'c4a6d59', seq: 2 } },
    };
    const { rollout } = reconcileRollout(healthy, live, { resetPending: true, deployed: ['backend', 'cdc'] });
    expect(rollout.cdc).toEqual({ seq: 2 });
    expect(rollout.backend).toEqual(healthy.backend);
  });

  it('without resetPending, keeps the entries of services the config gives no VM', () => {
    const { rollout } = reconcileRollout(afterFailedDeploy, live, { resetPending: false });
    expect(rollout.cdc).toEqual(afterFailedDeploy.cdc);
  });

  it('without resetPending, keeps the intent and leaves the dropped pointer empty for a first-deploy cutover', () => {
    const { rollout } = reconcileRollout(afterFailedDeploy, live, { resetPending: false });
    expect(rollout.backend).toEqual({ seq: 3, pendingSha: '84b7e22' });
  });

  it('under resetPending, keeps a live active pointer and only drops the intent', () => {
    // A start-first gate failure leaves both VMs: the old one stays active, the failed new one is planned away.
    const both = [{ service: 'backend' as const, genId: 'f9a8', sha: 'e9a8d48' }, ...live];
    const { rollout } = reconcileRollout(afterFailedDeploy, both, reset);
    expect(rollout.backend).toEqual({ seq: 3, active: { id: 'f9a8', sha: 'e9a8d48', seq: 3 } });
  });

  it('changes nothing on a healthy control object and does not mutate its input', () => {
    const healthy = { backend: { seq: 4, active: { id: 'ba1d', sha: '84b7e22', seq: 4 } } };
    const snapshot = structuredClone(afterFailedDeploy);
    expect(reconcileRollout(healthy, live, reset)).toEqual({ rollout: healthy, changes: [] });
    reconcileRollout(afterFailedDeploy, live, reset);
    expect(afterFailedDeploy).toEqual(snapshot);
  });
});

describe('parseReconcileOptions', () => {
  it('reads the deployed services the deploy passes with --reset-pending', () => {
    expect(parseReconcileOptions(['--stack', 'production', '--reset-pending', '--deployed', 'backend, frontend'])).toEqual({
      resetPending: true,
      deployed: ['backend', 'frontend'],
    });
    expect(parseReconcileOptions(['--stack', 'production'])).toEqual({ resetPending: false });
  });

  it('refuses --reset-pending without a deployed set, which would drop every pointer', () => {
    expect(() => parseReconcileOptions(['--reset-pending'])).toThrow(/--deployed/);
    expect(() => parseReconcileOptions(['--reset-pending', '--deployed', ' , '])).toThrow(/--deployed/);
  });
});
