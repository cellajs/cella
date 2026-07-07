import { describe, expect, it } from 'vitest';
import { appConfig } from '../config-builder/app-config';
import { configurePermissions } from './access-policies';
import { getAllDecisions } from './permission-manager/check';
import type { SubjectForPermission } from './permission-manager/types';
import type { PublicReadGrants } from './public-read';

/**
 * Public read grants: subject-level, membership-independent read access based on row
 * data. Evaluated for anonymous actors (no memberships, no userId) and members alike.
 *
 * Uses the template hierarchy (organization > attachment): organization publishes
 * itself (publicSelf), attachment derives publicity from its parent (publicParent /
 * publicParentOrSelf).
 */

const NOW = '2026-07-06T12:00:00Z';

const grants: PublicReadGrants = {
  organization: 'publicSelf',
  attachment: 'publicParent',
};

const orgSubject = (publicAt: string | null): SubjectForPermission => ({
  entityType: 'organization',
  id: 'org1',
  contextIds: {},
  row: { publicAt },
});

const attachmentSubject = (parentPublicAt: string | null): SubjectForPermission => ({
  entityType: 'attachment',
  id: 'a1',
  contextIds: { organization: 'org1' },
  parentRow: { publicAt: parentPublicAt },
});

// No policies at all: everything below must come from public grants alone.
const noPolicies = {};

describe('public read grants — anonymous actor', () => {
  it('publicSelf grants read when the row publicAt is set', () => {
    const { can, actions } = getAllDecisions(noPolicies, [], orgSubject(NOW), { publicGrants: grants });
    expect(can.read).toBe(true);
    expect(actions.read.grantedBy).toEqual([{ type: 'public', mode: 'publicSelf' }]);
  });

  it('publicSelf denies when publicAt is null or row data is absent', () => {
    expect(getAllDecisions(noPolicies, [], orgSubject(null), { publicGrants: grants }).can.read).toBe(false);

    const noRow: SubjectForPermission = { entityType: 'organization', id: 'org1', contextIds: {} };
    expect(getAllDecisions(noPolicies, [], noRow, { publicGrants: grants }).can.read).toBe(false);
  });

  it('publicParent grants read from the resolved parent row only', () => {
    expect(getAllDecisions(noPolicies, [], attachmentSubject(NOW), { publicGrants: grants }).can.read).toBe(true);
    expect(getAllDecisions(noPolicies, [], attachmentSubject(null), { publicGrants: grants }).can.read).toBe(false);

    // Own row publicAt must NOT satisfy publicParent
    const ownPublicOnly: SubjectForPermission = {
      entityType: 'attachment',
      id: 'a1',
      contextIds: { organization: 'org1' },
      row: { publicAt: NOW },
    };
    expect(getAllDecisions(noPolicies, [], ownPublicOnly, { publicGrants: grants }).can.read).toBe(false);
  });

  it('publicParentOrSelf grants from either row', () => {
    const orSelfGrants: PublicReadGrants = { organization: 'publicSelf', attachment: 'publicParentOrSelf' };
    const self: SubjectForPermission = {
      entityType: 'attachment',
      id: 'a1',
      contextIds: { organization: 'org1' },
      row: { publicAt: NOW },
    };
    const parent: SubjectForPermission = { ...self, row: {}, parentRow: { publicAt: NOW } };
    const neither: SubjectForPermission = { ...self, row: {}, parentRow: {} };

    expect(getAllDecisions(noPolicies, [], self, { publicGrants: orSelfGrants }).can.read).toBe(true);
    expect(getAllDecisions(noPolicies, [], parent, { publicGrants: orSelfGrants }).can.read).toBe(true);
    expect(getAllDecisions(noPolicies, [], neither, { publicGrants: orSelfGrants }).can.read).toBe(false);
  });

  it('grants read only — other actions stay denied', () => {
    const { can } = getAllDecisions(noPolicies, [], orgSubject(NOW), { publicGrants: grants });
    expect(can.read).toBe(true);
    expect(can.create).toBe(false);
    expect(can.update).toBe(false);
    expect(can.delete).toBe(false);
  });

  it('no grant declared for the entity type → no public read', () => {
    const attachmentOnlyGrants: PublicReadGrants = { organization: 'publicSelf' };
    const subject: SubjectForPermission = {
      entityType: 'attachment',
      id: 'a1',
      contextIds: { organization: 'org1' },
      row: { publicAt: NOW },
      parentRow: { publicAt: NOW },
    };
    expect(getAllDecisions(noPolicies, [], subject, { publicGrants: attachmentOnlyGrants }).can.read).toBe(false);
  });

  it('no publicGrants passed → engine behaves exactly as before', () => {
    expect(getAllDecisions(noPolicies, [], orgSubject(NOW)).can.read).toBe(false);
  });
});

describe('configurePermissions — publicRead declaration', () => {
  it('collects grants per subject and returns them alongside policies', () => {
    const { publicReadGrants } = configurePermissions(appConfig.entityTypes, ({ subject, publicRead }) => {
      if (subject.name === 'organization') publicRead('publicSelf');
      if (subject.name === 'attachment') publicRead('publicParent');
    });
    expect(publicReadGrants).toEqual({ organization: 'publicSelf', attachment: 'publicParent' });
  });

  it('throws when publicRead is declared twice for a subject', () => {
    expect(() =>
      configurePermissions(appConfig.entityTypes, ({ subject, publicRead }) => {
        if (subject.name === 'organization') {
          publicRead('publicSelf');
          publicRead('publicSelf');
        }
      }),
    ).toThrow('publicRead() called twice');
  });

  it("throws when a parent-dependent grant's parent has no self-publication grant", () => {
    expect(() =>
      configurePermissions(appConfig.entityTypes, ({ subject, publicRead }) => {
        if (subject.name === 'attachment') publicRead('publicParent');
      }),
    ).toThrow('no self-publication grant');

    expect(() =>
      configurePermissions(appConfig.entityTypes, ({ subject, publicRead }) => {
        if (subject.name === 'attachment') publicRead('publicParentOrSelf');
      }),
    ).toThrow('no self-publication grant');
  });
});
