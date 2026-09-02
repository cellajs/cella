import { describe, expect, it } from 'vitest';
import type { EntityType } from '../../types.ts';
import {
  configureWidePermissions,
  wideEntityTypes,
  wideHierarchy,
  wideMembership,
  wideOverrides,
  wideSubject,
} from '../testing/wide-fixture.ts';
import { getAllDecisions } from './engine/index.ts';
import { configurePermissions } from './policy-matrix.ts';

/** The wide fixture's root floor role; the callbacks below configure `wideOverrides`, not the app hierarchy. */
const memberRole = wideHierarchy.getLeastPrivilegedRole(wideHierarchy.rootChannelType);

describe('missing policy rows', () => {
  it('denies every action instead of requiring explicit all-zero rows', () => {
    const { policyMatrix } = configurePermissions(
      wideEntityTypes as unknown as readonly EntityType[],
      ({ entityType, channels }) => {
        if (entityType === 'attachment') channels.organization.admin({ read: 1 });
      },
      wideOverrides,
    );

    const decision = getAllDecisions(
      policyMatrix,
      [wideMembership('organization', 'org1', 'member')],
      wideSubject({
        entityType: 'attachment',
        channelIds: { organization: 'org1', project: 'project1' },
      }),
      { ...wideOverrides },
    );

    expect(decision.can).toEqual({ create: false, read: false, update: false, delete: false });
  });

  it('still allows membership-independent public reads without policy rows', () => {
    const { policyMatrix, publicReadGrants } = configurePermissions(
      wideEntityTypes as unknown as readonly EntityType[],
      ({ entityType, publicRead }) => {
        if (entityType === 'attachment') publicRead();
      },
      wideOverrides,
    );

    const decision = getAllDecisions(
      policyMatrix,
      [wideMembership('organization', 'org1', 'member')],
      wideSubject({
        entityType: 'attachment',
        channelIds: { organization: 'org1', project: 'project1' },
        row: { publicAt: '2026-07-15T00:00:00.000Z' },
      }),
      { ...wideOverrides, publicGrants: publicReadGrants },
    );

    expect(decision.can.read).toBe(true);
    expect(decision.actions.read.grantedBy).toEqual([{ type: 'public' }]);
  });
});

describe('row conditions on create', () => {
  const configure = configureWidePermissions;

  it("rejects create: 'own' because no row exists yet", () => {
    expect(() =>
      configure(({ entityType, channels }) => {
        if (entityType === 'attachment') channels.organization[memberRole]({ create: 'own', read: 1 });
      }),
    ).toThrow(/row condition[\s\S]*'create'[\s\S]*never match/);
  });

  it("allows 'own' on read, update and delete", () => {
    expect(() =>
      configure(({ entityType, channels }) => {
        if (entityType === 'attachment') {
          channels.organization[memberRole]({ create: 1, read: 'own', update: 'own', delete: 'own' });
        }
      }),
    ).not.toThrow();
  });
});
