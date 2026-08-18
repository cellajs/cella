import { describe, expect, it } from 'vitest';
import { getAllDecisions } from '../permissions/index.ts';
import { configureWidePermissions, wideHierarchy, wideMembership, wideOverrides, wideSubject } from './wide-fixture.ts';

/** Proves the hierarchy override drives the engine over the synthetic hierarchy. */
describe('wide fixture kit', () => {
  it('exposes a nested hierarchy with a guest role', () => {
    expect(wideHierarchy.getOrderedAncestors('attachment')).toEqual(['project', 'organization']);
    expect([...wideHierarchy.getRoles('project')]).toContain('guest');
  });

  it('resolves a project-level grant through getAllDecisions on the wide hierarchy', () => {
    const { policyMatrix } = configureWidePermissions(({ entityType, channels }) => {
      if (entityType === 'attachment') {
        channels.project.guest({ read: 1 });
      }
    });

    const decision = getAllDecisions(
      policyMatrix,
      [wideMembership('project', 'p1', 'guest')],
      wideSubject({ entityType: 'attachment', id: 'a1', channelIds: { organization: 'o1', project: 'p1' } }),
      { ...wideOverrides },
    );

    expect(decision.can.read).toBe(true);
    expect(decision.can.update).toBe(false);
  });
});
