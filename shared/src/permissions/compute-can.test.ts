import { describe, expect, it } from 'vitest';
import { computeCan } from './compute-can';
import { computeWideCan, configureWidePermissions, wideMembership, wideOverrides } from '../testing/wide-fixture';

// Policies with 'own' permission for attachment update/delete, plus project-scoped grants
// (attachment guest-read, task member-update) used by the wider coverage below.
const { policyMatrix: policies } = configureWidePermissions(({ entityType, channels }) => {
  switch (entityType) {
    case 'organization':
      channels.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
      channels.organization.member({ create: 0, read: 1, update: 0, delete: 0 });
      break;
    case 'attachment':
      channels.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
      channels.organization.member({ create: 1, read: 1, update: 'own', delete: 'own' });
      channels.project.admin({ create: 1, read: 1, update: 1, delete: 1 });
      channels.project.member({ create: 1, read: 1, update: 'own', delete: 'own' });
      channels.project.guest({ create: 0, read: 1, update: 0, delete: 0 });
      break;
    case 'task':
      channels.organization.member({ create: 0, read: 1, update: 0, delete: 0 });
      channels.project.member({ create: 1, read: 1, update: 1, delete: 0 });
      break;
  }
});

describe('computeCan with own permissions', () => {
  // --- Pass cases: 'own' state should be preserved ---

  it('returns own for member attachment update/delete', () => {
    const membership = wideMembership('organization', 'org1', 'member');
    const can = computeCan('organization', membership, policies, wideOverrides);

    expect(can.attachment?.update).toBe('own');
    expect(can.attachment?.delete).toBe('own');
  });

  it('returns true for member attachment create/read alongside own', () => {
    const membership = wideMembership('organization', 'org1', 'member');
    const can = computeCan('organization', membership, policies, wideOverrides);

    expect(can.attachment?.create).toBe(true);
    expect(can.attachment?.read).toBe(true);
  });

  // --- Pass cases: admin gets unconditional true ---

  it('returns true (not own) for admin on all attachment actions', () => {
    const membership = wideMembership('organization', 'org1', 'admin');
    const can = computeCan('organization', membership, policies, wideOverrides);

    expect(can.attachment?.create).toBe(true);
    expect(can.attachment?.read).toBe(true);
    expect(can.attachment?.update).toBe(true);
    expect(can.attachment?.delete).toBe(true);
  });

  // --- Fail cases: denied actions stay false ---

  it('returns false for member organization create/update/delete', () => {
    const membership = wideMembership('organization', 'org1', 'member');
    const can = computeCan('organization', membership, policies, wideOverrides);

    expect(can.organization?.create).toBe(false);
    expect(can.organization?.update).toBe(false);
    expect(can.organization?.delete).toBe(false);
  });

  // --- Edge case: no membership ---

  it('returns empty map when membership is null', () => {
    const can = computeCan('organization', null, policies, wideOverrides);
    expect(can).toEqual({});
  });

  it('returns empty map when membership is undefined', () => {
    const can = computeCan('organization', undefined, policies, wideOverrides);
    expect(can).toEqual({});
  });

  // --- Wider coverage: channels/roles the shallow org/attachment shape couldn't express ---

  it('grants read-only access to a project guest on attachment (guest-only grant)', () => {
    const membership = wideMembership('project', 'p1', 'guest');
    const can = computeWideCan('project', membership, policies);

    expect(can.attachment?.read).toBe(true);
    expect(can.attachment?.create).toBe(false);
    expect(can.attachment?.update).toBe(false);
    expect(can.attachment?.delete).toBe(false);
  });

  it('differs between an organization member and a project member on the same descendant (task)', () => {
    const orgMembership = wideMembership('organization', 'org1', 'member');
    const projectMembership = wideMembership('project', 'p1', 'member');

    const orgCan = computeWideCan('organization', orgMembership, policies);
    const projectCan = computeWideCan('project', projectMembership, policies);

    // Org members can read tasks across the org, but not update them...
    expect(orgCan.task?.read).toBe(true);
    expect(orgCan.task?.update).toBe(false);

    // ...while project members additionally get update rights scoped to their project.
    expect(projectCan.task?.read).toBe(true);
    expect(projectCan.task?.update).toBe(true);
  });
});

describe('computeCan three-state semantics', () => {
  // Policies where every row-conditionable action is 'own' for member. `create` can't take a row
  // condition (rejected at config time: no row exists yet), so it is unconditional here.
  const { policyMatrix: allOwnPolicies } = configureWidePermissions(({ entityType, channels }) => {
    switch (entityType) {
      case 'attachment':
        channels.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
        channels.organization.member({ create: 1, read: 'own', update: 'own', delete: 'own' });
        break;
    }
  });

  it('preserves own for every row-conditional action', () => {
    const membership = wideMembership('organization', 'org1', 'member');
    const can = computeCan('organization', membership, allOwnPolicies, wideOverrides);

    expect(can.attachment?.read).toBe('own');
    expect(can.attachment?.update).toBe('own');
    expect(can.attachment?.delete).toBe('own');
  });

  it('does not conflate own with true — they are distinct values', () => {
    const membership = wideMembership('organization', 'org1', 'member');
    const can = computeCan('organization', membership, allOwnPolicies, wideOverrides);

    // 'own' is truthy but !== true
    expect(can.attachment?.update).not.toBe(true);
    expect(can.attachment?.update).not.toBe(false);
    expect(can.attachment?.update).toBe('own');
  });
});
