import { describe, expect, it } from 'vitest';
import { getAllDecisions } from './permission-manager/check';
import type { SubjectForPermission } from './permission-manager/types';
import { configureWidePermissions, widePublicGrants, wideSubject, wideTopology } from '../testing/wide-fixture';

/**
 * Public read grants (`publicRead`): subject-level, membership-independent read access based on
 * row data, evaluated for anonymous actors (no memberships, no userId) and members alike.
 *
 * Runs against the wide fixture (organization → workspace/project, project → task/label/attachment),
 * not a fork's app config.
 */
const NOW = '2026-07-06T12:00:00Z';

const grants = widePublicGrants({
  project: 'publicSelf',
  task: 'publicParent',
  attachment: 'publicParentOrSelf',
});

const projectSubject = (publicAt: string | null): SubjectForPermission =>
  wideSubject({
    entityType: 'project',
    id: 'p1',
    contextIds: { organization: 'org1' },
    row: { publicAt },
  });

const taskSubject = (parentPublicAt: string | null): SubjectForPermission =>
  wideSubject({
    entityType: 'task',
    id: 't1',
    contextIds: { organization: 'org1', project: 'p1' },
    parentRow: { publicAt: parentPublicAt },
  });

// No policies at all: everything below must come from public grants alone.
const noPolicies = {};

describe('public read grants — anonymous actor', () => {
  it('publicSelf grants read when the row publicAt is set', () => {
    const { can, actions } = getAllDecisions(noPolicies, [], projectSubject(NOW), {
      publicGrants: grants,
      topology: wideTopology,
    });
    expect(can.read).toBe(true);
    expect(actions.read.grantedBy).toEqual([{ type: 'public', mode: 'publicSelf' }]);
  });

  it('publicSelf denies when publicAt is null or row data is absent', () => {
    expect(
      getAllDecisions(noPolicies, [], projectSubject(null), { publicGrants: grants, topology: wideTopology }).can
        .read,
    ).toBe(false);

    const noRow = wideSubject({ entityType: 'project', id: 'p1', contextIds: { organization: 'org1' } });
    expect(
      getAllDecisions(noPolicies, [], noRow, { publicGrants: grants, topology: wideTopology }).can.read,
    ).toBe(false);
  });

  it('publicParent grants read from the resolved parent row only', () => {
    expect(
      getAllDecisions(noPolicies, [], taskSubject(NOW), { publicGrants: grants, topology: wideTopology }).can.read,
    ).toBe(true);
    expect(
      getAllDecisions(noPolicies, [], taskSubject(null), { publicGrants: grants, topology: wideTopology }).can.read,
    ).toBe(false);

    // Own row publicAt must NOT satisfy publicParent
    const ownPublicOnly = wideSubject({
      entityType: 'task',
      id: 't1',
      contextIds: { organization: 'org1', project: 'p1' },
      row: { publicAt: NOW },
    });
    expect(
      getAllDecisions(noPolicies, [], ownPublicOnly, { publicGrants: grants, topology: wideTopology }).can.read,
    ).toBe(false);
  });

  it('publicParentOrSelf grants from either row', () => {
    const self = wideSubject({
      entityType: 'attachment',
      id: 'a1',
      contextIds: { organization: 'org1', project: 'p1' },
      row: { publicAt: NOW },
    });
    const parent: SubjectForPermission = { ...self, row: {}, parentRow: { publicAt: NOW } };
    const neither: SubjectForPermission = { ...self, row: {}, parentRow: {} };

    expect(
      getAllDecisions(noPolicies, [], self, { publicGrants: grants, topology: wideTopology }).can.read,
    ).toBe(true);
    expect(
      getAllDecisions(noPolicies, [], parent, { publicGrants: grants, topology: wideTopology }).can.read,
    ).toBe(true);
    expect(
      getAllDecisions(noPolicies, [], neither, { publicGrants: grants, topology: wideTopology }).can.read,
    ).toBe(false);
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
    expect(
      getAllDecisions(noPolicies, [], orgSubject, { publicGrants: grants, topology: wideTopology }).can.read,
    ).toBe(false);
  });

  it('no publicGrants passed → engine behaves exactly as before', () => {
    expect(getAllDecisions(noPolicies, [], projectSubject(NOW), { topology: wideTopology }).can.read).toBe(false);
  });
});

describe('configurePermissions — publicRead declaration', () => {
  it('collects grants per subject and returns them alongside policies', () => {
    const { publicReadGrants } = configureWidePermissions(({ subject, publicRead }) => {
      if (subject.name === 'project') publicRead('publicSelf');
      if (subject.name === 'task') publicRead('publicParent');
    });
    expect(publicReadGrants).toEqual({ project: 'publicSelf', task: 'publicParent' });
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

  it("throws when a parent-dependent grant's parent has no self-publication grant", () => {
    expect(() =>
      configureWidePermissions(({ subject, publicRead }) => {
        if (subject.name === 'task') publicRead('publicParent');
      }),
    ).toThrow('no self-publication grant');

    expect(() =>
      configureWidePermissions(({ subject, publicRead }) => {
        if (subject.name === 'attachment') publicRead('publicParentOrSelf');
      }),
    ).toThrow('no self-publication grant');
  });
});
