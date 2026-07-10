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
