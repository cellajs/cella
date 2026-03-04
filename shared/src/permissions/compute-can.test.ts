import { appConfig, configureAccessPolicies } from 'shared';
import { describe, expect, it } from 'vitest';
import { computeCan } from './compute-can';

// Policies with 'own' permission for attachment update/delete
const policies = configureAccessPolicies(appConfig.entityTypes, ({ subject, contexts }) => {
  switch (subject.name) {
    case 'organization':
      contexts.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
      contexts.organization.member({ create: 0, read: 1, update: 0, delete: 0 });
      break;
    case 'attachment':
      contexts.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
      contexts.organization.member({ create: 1, read: 1, update: 'own', delete: 'own' });
      break;
  }
});

describe('computeCan with own permissions', () => {
  // --- Pass cases: 'own' state should be preserved ---

  it('returns own for member attachment update/delete', () => {
    const membership = { contextType: 'organization' as const, role: 'member' as const };
    const can = computeCan('organization', membership, policies);

    expect(can.attachment?.update).toBe('own');
    expect(can.attachment?.delete).toBe('own');
  });

  it('returns true for member attachment create/read alongside own', () => {
    const membership = { contextType: 'organization' as const, role: 'member' as const };
    const can = computeCan('organization', membership, policies);

    expect(can.attachment?.create).toBe(true);
    expect(can.attachment?.read).toBe(true);
  });

  // --- Pass cases: admin gets unconditional true ---

  it('returns true (not own) for admin on all attachment actions', () => {
    const membership = { contextType: 'organization' as const, role: 'admin' as const };
    const can = computeCan('organization', membership, policies);

    expect(can.attachment?.create).toBe(true);
    expect(can.attachment?.read).toBe(true);
    expect(can.attachment?.update).toBe(true);
    expect(can.attachment?.delete).toBe(true);
  });

  // --- Fail cases: denied actions stay false ---

  it('returns false for member organization create/update/delete', () => {
    const membership = { contextType: 'organization' as const, role: 'member' as const };
    const can = computeCan('organization', membership, policies);

    expect(can.organization?.create).toBe(false);
    expect(can.organization?.update).toBe(false);
    expect(can.organization?.delete).toBe(false);
  });

  // --- Edge case: no membership ---

  it('returns empty map when membership is null', () => {
    const can = computeCan('organization', null, policies);
    expect(can).toEqual({});
  });

  it('returns empty map when membership is undefined', () => {
    const can = computeCan('organization', undefined, policies);
    expect(can).toEqual({});
  });
});

describe('computeCan three-state semantics', () => {
  // Policies where every action is 'own' for member
  const allOwnPolicies = configureAccessPolicies(appConfig.entityTypes, ({ subject, contexts }) => {
    switch (subject.name) {
      case 'attachment':
        contexts.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
        contexts.organization.member({ create: 'own', read: 'own', update: 'own', delete: 'own' });
        break;
    }
  });

  it('preserves own for every action when all policies are own', () => {
    const membership = { contextType: 'organization' as const, role: 'member' as const };
    const can = computeCan('organization', membership, allOwnPolicies);

    expect(can.attachment?.create).toBe('own');
    expect(can.attachment?.read).toBe('own');
    expect(can.attachment?.update).toBe('own');
    expect(can.attachment?.delete).toBe('own');
  });

  it('does not conflate own with true — they are distinct values', () => {
    const membership = { contextType: 'organization' as const, role: 'member' as const };
    const can = computeCan('organization', membership, allOwnPolicies);

    // 'own' is truthy but !== true
    expect(can.attachment?.update).not.toBe(true);
    expect(can.attachment?.update).not.toBe(false);
    expect(can.attachment?.update).toBe('own');
  });
});
