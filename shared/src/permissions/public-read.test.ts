import { describe, expect, it } from 'vitest';
import { configureWidePermissions, widePublicGrants, wideSubject, wideTopology } from '../testing/wide-fixture';
import { getAllDecisions } from './permission-manager/check';
import type { SubjectForPermission } from './permission-manager/types';
import { publicRow } from './public-read';
import { rowPredicateMatches } from './row-conditions';

/**
 * Public read grants (`publicRead`): subject-level, membership-independent read access derived
 * from the row's own `publicAt`, evaluated for anonymous actors (no memberships, no userId) and
 * members alike.
 *
 * There is exactly one mode. A grant derived from ANOTHER row would be unenforceable in the two
 * paths that must agree with the engine — the collection-read SQL compiler and CDC stream
 * dispatch, which only ever ships the row itself. Cascading publication is a data concern.
 *
 * Runs against the wide fixture (organization → workspace/project, project → task/label/attachment),
 * not a fork's app config.
 */
const NOW = '2026-07-06T12:00:00Z';

const grants = widePublicGrants({ project: 'publicSelf', task: 'publicSelf' });

const projectSubject = (publicAt: string | null): SubjectForPermission =>
  wideSubject({
    entityType: 'project',
    id: 'p1',
    contextIds: { organization: 'org1' },
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
    expect(actions.read.grantedBy).toEqual([{ type: 'public', mode: 'publicSelf' }]);
  });

  it('denies when publicAt is null or row data is absent', () => {
    expect(
      getAllDecisions(noPolicies, [], projectSubject(null), { publicGrants: grants, topology: wideTopology }).can.read,
    ).toBe(false);

    const noRow = wideSubject({ entityType: 'project', id: 'p1', contextIds: { organization: 'org1' } });
    expect(getAllDecisions(noPolicies, [], noRow, { publicGrants: grants, topology: wideTopology }).can.read).toBe(
      false,
    );
  });

  it('reads the row itself, never an ancestor: a public parent does NOT publish its children', () => {
    // The project (parent) is public; the task is not. Publication does not cascade through the
    // permission engine — a fork that wants it propagates `publicAt` to the child row.
    const task = wideSubject({
      entityType: 'task',
      id: 't1',
      contextIds: { organization: 'org1', project: 'p1' },
      row: { publicAt: null },
    });
    expect(getAllDecisions(noPolicies, [], task, { publicGrants: grants, topology: wideTopology }).can.read).toBe(
      false,
    );

    // ...and once the child row itself carries publicAt, it is readable.
    const publishedTask = wideSubject({
      entityType: 'task',
      id: 't1',
      contextIds: { organization: 'org1', project: 'p1' },
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
      contextIds: {},
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

describe('publicRow — the shared predicate', () => {
  it('is actor-independent: it matches for anonymous actors', () => {
    expect(rowPredicateMatches(publicRow.predicate, { publicAt: NOW }, {})).toBe(true);
    expect(rowPredicateMatches(publicRow.predicate, { publicAt: null }, {})).toBe(false);
    expect(rowPredicateMatches(publicRow.predicate, {}, {})).toBe(false);
  });

  it('is a column-is-not-null predicate, so collection SQL can enforce it', () => {
    // This is what makes public read enforceable in list endpoints. An actor-bound or
    // cross-row predicate could not be compiled, and public rows would silently vanish from lists.
    expect(publicRow.predicate).toEqual({ kind: 'columnIsNotNull', column: 'publicAt' });
  });
});

describe('configurePermissions — publicRead declaration', () => {
  it('collects grants per subject and returns them alongside policies', () => {
    const { publicReadGrants } = configureWidePermissions(({ subject, publicRead }) => {
      if (subject.name === 'project') publicRead('publicSelf');
      if (subject.name === 'task') publicRead('publicSelf');
    });
    expect(publicReadGrants).toEqual({ project: 'publicSelf', task: 'publicSelf' });
  });

  it('throws when publicRead is declared twice for a subject', () => {
    expect(() =>
      configureWidePermissions(({ subject, publicRead }) => {
        if (subject.name === 'project') {
          publicRead('publicSelf');
          publicRead('publicSelf');
        }
      }),
    ).toThrow('publicRead() called twice');
  });
});
