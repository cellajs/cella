import { describe, expect, it } from 'vitest';
import type { EntityType } from '../../types';
import { wideEntityTypes, wideTopology } from '../testing/wide-fixture';
import type { AccessPolicyCallback } from './types';
import { configurePermissions } from './access-policies';

/**
 * Config-time policy completeness (mirrors the engine's strict runtime rule): a subject
 * with ANY declared rows must declare one for every role of every context in its chain,
 * or the engine throws a request-time 500 the first time such a membership appears.
 */
describe('configurePermissions completeness validation', () => {
  const configure = (callback: AccessPolicyCallback, validateCompleteness = true) =>
    configurePermissions(wideEntityTypes as unknown as readonly EntityType[], callback, wideTopology, {
      validateCompleteness,
    });

  it('rejects a subject missing a role row in its chain', () => {
    expect(() =>
      configure(({ subject, contexts }) => {
        if (subject.name !== 'attachment') return;
        // organization has admin + member in the wide fixture; member row omitted
        contexts.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
      }),
    ).toThrow(/Incomplete policy[\s\S]*attachment[\s\S]*organization\.member/);
  });

  it('accepts all-zero rows as explicit "no access"', () => {
    expect(() =>
      configure(({ subject, contexts }) => {
        if (subject.name !== 'organization') return;
        contexts.organization.admin({ read: 1, update: 1, delete: 1 });
        contexts.organization.member({});
      }),
    ).not.toThrow();
  });

  it('skips subjects with no declared case at all', () => {
    expect(() => configure(() => {})).not.toThrow();
  });

  it('can be opted out for deliberately partial fixtures', () => {
    expect(() =>
      configure(({ subject, contexts }) => {
        if (subject.name !== 'attachment') return;
        contexts.organization.admin({ read: 1 });
      }, false),
    ).not.toThrow();
  });
});

describe('configurePermissions — row condition on create is rejected at boot', () => {
  const configure = (callback: AccessPolicyCallback) =>
    configurePermissions(wideEntityTypes as unknown as readonly EntityType[], callback, wideTopology, {
      // opt out of completeness so the test isolates the create-condition check
      validateCompleteness: false,
    });

  it("throws for create: 'own' — it can never match (no row exists yet)", () => {
    expect(() =>
      configure(({ subject, contexts }) => {
        if (subject.name !== 'attachment') return;
        contexts.organization.member({ create: 'own', read: 1 });
      }),
    ).toThrow(/row condition[\s\S]*'create'[\s\S]*never match/);
  });

  it("allows 'own' on read/update/delete", () => {
    expect(() =>
      configure(({ subject, contexts }) => {
        if (subject.name !== 'attachment') return;
        contexts.organization.member({ create: 1, read: 'own', update: 'own', delete: 'own' });
      }),
    ).not.toThrow();
  });
});
