import { describe, expect, it } from 'vitest';
import { configureWidePermissions, wideOverrides, widePublicGrants, wideSubject } from '../testing/wide-fixture.ts';
import { getAllDecisions } from './engine/check.ts';
import type { SubjectForPermission } from './engine/types.ts';
import { matchesRowCondition } from './row-conditions.ts';

/**
 * Membership-independent reads from the row's own `public` flag, over the wide synthetic hierarchy.
 * Parent-derived publication stays outside the engine: SQL and stream dispatch read row-local
 * fields only.
 */
const grants = widePublicGrants({ project: true, task: true });

const projectSubject = (isPublic: boolean): SubjectForPermission =>
  wideSubject({ entityType: 'project', id: 'p1', channelIds: { organization: 'org1' }, row: { public: isPublic } });

// No policies at all: everything below must come from public grants alone.
const noPolicies = {};

describe('public read grants: anonymous actor', () => {
  it('grants read when the row is public', () => {
    const { can, actions } = getAllDecisions(noPolicies, [], projectSubject(true), { publicGrants: grants, ...wideOverrides });
    expect(can.read).toBe(true);
    expect(actions.read.grantedBy).toEqual([{ type: 'public' }]);
  });

  it('denies when the row is not public or row data is absent', () => {
    expect(getAllDecisions(noPolicies, [], projectSubject(false), { publicGrants: grants, ...wideOverrides }).can.read).toBe(false);

    const noRow = wideSubject({ entityType: 'project', id: 'p1', channelIds: { organization: 'org1' } });
    expect(getAllDecisions(noPolicies, [], noRow, { publicGrants: grants, ...wideOverrides }).can.read).toBe(false);
  });

  it('reads the row itself, never an ancestor: a public parent does NOT publish its children', () => {
    // The parent project is public, the task is not: publication never cascades through the
    // engine. An app that wants it copies the `public` flag to the child row.
    const task = wideSubject({ entityType: 'task', id: 't1', channelIds: { organization: 'org1', project: 'p1' }, row: { public: false } });
    expect(getAllDecisions(noPolicies, [], task, { publicGrants: grants, ...wideOverrides }).can.read).toBe(false);

    // ...and once the child row itself is public, it is readable.
    const publishedTask = wideSubject({ entityType: 'task', id: 't1', channelIds: { organization: 'org1', project: 'p1' }, row: { public: true } });
    expect(getAllDecisions(noPolicies, [], publishedTask, { publicGrants: grants, ...wideOverrides }).can.read).toBe(true);
  });

  it('grants read only: other actions stay denied', () => {
    const { can } = getAllDecisions(noPolicies, [], projectSubject(true), { publicGrants: grants, ...wideOverrides });
    expect(can.read).toBe(true);
    expect(can.create).toBe(false);
    expect(can.update).toBe(false);
    expect(can.delete).toBe(false);
  });

  it('no grant declared for the entity type → no public read', () => {
    const orgSubject = wideSubject({ entityType: 'organization', id: 'org1', channelIds: {}, row: { public: true } });
    expect(getAllDecisions(noPolicies, [], orgSubject, { publicGrants: grants, ...wideOverrides }).can.read).toBe(false);
  });

  it('no publicGrants passed → engine behaves exactly as before', () => {
    expect(getAllDecisions(noPolicies, [], projectSubject(true), { ...wideOverrides }).can.read).toBe(false);
  });
});

describe("the 'public' row condition: the shared rule", () => {
  it('is actor-independent and reads only the row: it matches for anonymous actors when the row is public', () => {
    // What makes public read enforceable in list endpoints: `'public'` reads only the row's own
    // `public` flag, so it compiles identically here and in collection SQL. An actor-bound or
    // cross-row rule would not compile, and public rows would drop out of lists.
    expect(matchesRowCondition('public', { public: true }, {})).toBe(true);
    expect(matchesRowCondition('public', { public: false }, {})).toBe(false);
    expect(matchesRowCondition('public', {}, {})).toBe(false);
  });
});

describe('configurePermissions: publicRead declaration', () => {
  it('collects grants per subject and returns them alongside policies', () => {
    const { publicReadGrants } = configureWidePermissions(({ entityType, publicRead }) => {
      if (entityType === 'project') publicRead();
      if (entityType === 'task') publicRead();
    });
    expect(publicReadGrants).toEqual({ project: true, task: true });
  });

  it('throws when publicRead is declared twice for a subject', () => {
    expect(() =>
      configureWidePermissions(({ entityType, publicRead }) => {
        if (entityType === 'project') {
          publicRead();
          publicRead();
        }
      }),
    ).toThrow('publicRead() called twice');
  });
});
