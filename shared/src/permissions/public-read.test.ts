import { describe, expect, it } from 'vitest';
import { configureWidePermissions, widePublicGrants, wideSubject, wideTopology } from '../testing/wide-fixture';
import { getAllDecisions } from './permission-manager/check';
import type { SubjectForPermission } from './permission-manager/types';
import { matchesRowCondition } from './row-conditions';

/**
 * Verifies membership-independent public reads from the row's own `publicAt` across the wide
 * synthetic topology. Parent-derived publication remains outside the permission engine because
 * SQL and stream dispatch evaluate row-local data.
 */
const NOW = '2026-07-06T12:00:00Z';

const grants = widePublicGrants({ project: true, task: true });

const projectSubject = (publicAt: string | null): SubjectForPermission =>
  wideSubject({
    entityType: 'project',
    id: 'p1',
    channelIds: { organization: 'org1' },
    row: { publicAt },
  });

// No policies at all: everything below must come from public grants alone.
const noPolicies = {};

describe('public read grants — anonymous actor', () => {
  it('grants read when the row publicAt is set', () => {
    const { can, actions } = getAllDecisions(noPolicies, [], projectSubject(NOW), {
      publicGrants: grants,
      topology: wideTopology,
    });
    expect(can.read).toBe(true);
    expect(actions.read.grantedBy).toEqual([{ type: 'public' }]);
  });

  it('denies when publicAt is null or row data is absent', () => {
    expect(
      getAllDecisions(noPolicies, [], projectSubject(null), { publicGrants: grants, topology: wideTopology }).can.read,
    ).toBe(false);

    const noRow = wideSubject({ entityType: 'project', id: 'p1', channelIds: { organization: 'org1' } });
    expect(getAllDecisions(noPolicies, [], noRow, { publicGrants: grants, topology: wideTopology }).can.read).toBe(
      false,
    );
  });

  it('reads the row itself, never an ancestor: a public parent does NOT publish its children', () => {
    // The project (parent) is public; the task is not. Publication does not cascade through the
    // permission engine: a fork that wants it propagates `publicAt` to the child row.
    const task = wideSubject({
      entityType: 'task',
      id: 't1',
      channelIds: { organization: 'org1', project: 'p1' },
      row: { publicAt: null },
    });
    expect(getAllDecisions(noPolicies, [], task, { publicGrants: grants, topology: wideTopology }).can.read).toBe(
      false,
    );

    // ...and once the child row itself carries publicAt, it is readable.
    const publishedTask = wideSubject({
      entityType: 'task',
      id: 't1',
      channelIds: { organization: 'org1', project: 'p1' },
      row: { publicAt: NOW },
    });
    expect(
      getAllDecisions(noPolicies, [], publishedTask, { publicGrants: grants, topology: wideTopology }).can.read,
    ).toBe(true);
  });

  it('grants read only — other actions stay denied', () => {
    const { can } = getAllDecisions(noPolicies, [], projectSubject(NOW), {
      publicGrants: grants,
      topology: wideTopology,
    });
    expect(can.read).toBe(true);
    expect(can.create).toBe(false);
    expect(can.update).toBe(false);
    expect(can.delete).toBe(false);
  });

  it('no grant declared for the entity type → no public read', () => {
    const orgSubject = wideSubject({
      entityType: 'organization',
      id: 'org1',
      channelIds: {},
      row: { publicAt: NOW },
    });
    expect(getAllDecisions(noPolicies, [], orgSubject, { publicGrants: grants, topology: wideTopology }).can.read).toBe(
      false,
    );
  });

  it('no publicGrants passed → engine behaves exactly as before', () => {
    expect(getAllDecisions(noPolicies, [], projectSubject(NOW), { topology: wideTopology }).can.read).toBe(false);
  });
});

describe("the 'public' row condition — the shared rule", () => {
  it('is actor-independent and reads only the row: it matches for anonymous actors when publicAt is set', () => {
    // This is what makes public read enforceable in list endpoints too: `'public'` reads only the
    // row's own `publicAt`, so it compiles identically in the check-form here and in collection SQL.
    // An actor-bound or cross-row rule could not be compiled, and public rows would vanish from lists.
    expect(matchesRowCondition('public', { publicAt: NOW }, {})).toBe(true);
    expect(matchesRowCondition('public', { publicAt: null }, {})).toBe(false);
    expect(matchesRowCondition('public', {}, {})).toBe(false);
  });
});

describe('configurePermissions — publicRead declaration', () => {
  it('collects grants per subject and returns them alongside policies', () => {
    const { publicReadGrants } = configureWidePermissions(({ subject, publicRead }) => {
      if (subject.name === 'project') publicRead();
      if (subject.name === 'task') publicRead();
    });
    expect(publicReadGrants).toEqual({ project: true, task: true });
  });

  it('throws when publicRead is declared twice for a subject', () => {
    expect(() =>
      configureWidePermissions(({ subject, publicRead }) => {
        if (subject.name === 'project') {
          publicRead();
          publicRead();
        }
      }),
    ).toThrow('publicRead() called twice');
  });
});
