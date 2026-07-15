import { describe, expect, it } from 'vitest';
import type { EntityType } from '../../types';
import { wideEntityTypes, wideMembership, wideSubject, wideTopology } from '../testing/wide-fixture';
import { configurePermissions } from './access-policies';
import { getAllDecisions } from './permission-manager';
import type { AccessPolicyCallback } from './types';

describe('missing policy rows', () => {
  it('denies every action instead of requiring explicit all-zero rows', () => {
    const { accessPolicies } = configurePermissions(
      wideEntityTypes as unknown as readonly EntityType[],
      ({ subject, contexts }) => {
        if (subject.name === 'attachment') contexts.organization.admin({ read: 1 });
      },
      wideTopology,
    );

    const decision = getAllDecisions(
      accessPolicies,
      [wideMembership('organization', 'org1', 'member')],
      wideSubject({
        entityType: 'attachment',
        channelIds: { organization: 'org1', project: 'project1' },
      }),
      { topology: wideTopology },
    );

    expect(decision.can).toEqual({ create: false, read: false, update: false, delete: false });
  });

  it('still allows membership-independent public reads without policy rows', () => {
    const { accessPolicies, publicReadGrants } = configurePermissions(
      wideEntityTypes as unknown as readonly EntityType[],
      ({ subject, publicRead }) => {
        if (subject.name === 'attachment') publicRead('publicSelf');
      },
      wideTopology,
    );

    const decision = getAllDecisions(
      accessPolicies,
      [wideMembership('organization', 'org1', 'member')],
      wideSubject({
        entityType: 'attachment',
        channelIds: { organization: 'org1', project: 'project1' },
        row: { publicAt: '2026-07-15T00:00:00.000Z' },
      }),
      { topology: wideTopology, publicGrants: publicReadGrants },
    );

    expect(decision.can.read).toBe(true);
    expect(decision.actions.read.grantedBy).toEqual([{ type: 'public', mode: 'publicSelf' }]);
  });
});

describe('row conditions on create', () => {
  const configure = (callback: AccessPolicyCallback) =>
    configurePermissions(wideEntityTypes as unknown as readonly EntityType[], callback, wideTopology);

  it("rejects create: 'own' because no row exists yet", () => {
    expect(() =>
      configure(({ subject, contexts }) => {
        if (subject.name === 'attachment') contexts.organization.member({ create: 'own', read: 1 });
      }),
    ).toThrow(/row condition[\s\S]*'create'[\s\S]*never match/);
  });

  it("allows 'own' on read, update and delete", () => {
    expect(() =>
      configure(({ subject, contexts }) => {
        if (subject.name === 'attachment') {
          contexts.organization.member({ create: 1, read: 'own', update: 'own', delete: 'own' });
        }
      }),
    ).not.toThrow();
  });
});
