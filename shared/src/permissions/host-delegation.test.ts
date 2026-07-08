import { describe, expect, it } from 'vitest';
import { getAllDecisions } from './permission-manager/check';
import type { SubjectForPermission } from './permission-manager/types';
import {
  configureWidePermissions,
  wideHostDelegation,
  wideMembership,
  widePublicGrants,
  wideRestrictions,
  wideSubject,
  wideTopology,
} from '../testing/wide-fixture';

/**
 * Host permission delegation (`delegateToHost`): a hosted row allows a delegated action if the
 * host row allows it, including the host's row conditions, public grants and restrictions.
 * Additive with the subject's own grants; fail-closed without a hostRow.
 *
 * Runs against the wide fixture (attachment → task host relation), which every fork can exercise
 * regardless of whether its own config declares a host relation.
 */
const { accessPolicies: policies } = configureWidePermissions(({ subject, contexts }) => {
  switch (subject.name) {
    case 'attachment':
      // No read cells at all: read must come from the host
      contexts.project.member({ update: 1 });
      contexts.organization.admin({});
      contexts.organization.member({});
      contexts.project.admin({});
      contexts.project.guest({});
      break;
    case 'task':
      contexts.organization.admin({ read: 1, update: 1 });
      contexts.organization.member({ read: 'own' });
      contexts.project.admin({ read: 1 });
      contexts.project.member({ read: 1 });
      contexts.project.guest({});
      break;
  }
});

const delegation = wideHostDelegation({ attachment: ['read'] });

const projectMember = wideMembership('project', 'p1', 'member');
const projectGuest = wideMembership('project', 'p1', 'guest');
const orgMember = wideMembership('organization', 'org1', 'member');

const hostedAttachment = (hostRow: Record<string, unknown> | undefined): SubjectForPermission =>
  wideSubject({
    entityType: 'attachment',
    id: 'att1',
    contextIds: { organization: 'org1', project: 'p1' },
    ...(hostRow !== undefined && { hostRow }),
  });

const taskRow = { id: 'task1', createdBy: 'creator-1' };

describe('host delegation', () => {
  it('grants a delegated action when the host allows it, attributed as host grant', () => {
    const decision = getAllDecisions(policies, [projectMember], hostedAttachment(taskRow), {
      userId: 'u1',
      hostDelegation: delegation,
      topology: wideTopology,
    });
    expect(decision.can.read).toBe(true);
    expect(decision.actions.read.grantedBy).toContainEqual({ type: 'host', hostType: 'task' });
  });

  it('denies when the host denies (no own grants to fall back on)', () => {
    const { can } = getAllDecisions(policies, [projectGuest], hostedAttachment(taskRow), {
      userId: 'u1',
      hostDelegation: delegation,
      topology: wideTopology,
    });
    expect(can.read).toBe(false);
  });

  it("evaluates the host's row conditions: task creator reads the hosted attachment via own-on-host", () => {
    const asCreator = getAllDecisions(policies, [orgMember], hostedAttachment(taskRow), {
      userId: 'creator-1',
      hostDelegation: delegation,
      topology: wideTopology,
    });
    expect(asCreator.can.read).toBe(true);

    const asOther = getAllDecisions(policies, [orgMember], hostedAttachment(taskRow), {
      userId: 'someone-else',
      hostDelegation: delegation,
      topology: wideTopology,
    });
    expect(asOther.can.read).toBe(false);
  });

  it("evaluates the host's public grant: anonymous reads a hosted row of a public host", () => {
    const publicTask = { ...taskRow, publicAt: '2026-01-01' };
    const { can } = getAllDecisions(policies, [], hostedAttachment(publicTask), {
      hostDelegation: delegation,
      publicGrants: widePublicGrants({ task: 'publicSelf' }),
      topology: wideTopology,
    });
    expect(can.read).toBe(true);
  });

  it("evaluates the host's restrictions: a restricted host hides its hosted rows", () => {
    const restrictedTask = { ...taskRow, audienceRoles: ['admin'] };
    const { can } = getAllDecisions(policies, [projectMember], hostedAttachment(restrictedTask), {
      userId: 'u1',
      hostDelegation: delegation,
      restrictions: wideRestrictions({ task: { rolesColumn: 'audienceRoles', exemptRoles: [] } }),
      topology: wideTopology,
    });
    expect(can.read).toBe(false);
  });

  it('only delegates the declared actions', () => {
    // Task update is org-admin-only; attachment update is project-member-owned. Delegation
    // covers read only: update stays governed by the attachment's own cells.
    const decision = getAllDecisions(policies, [projectMember], hostedAttachment(taskRow), {
      userId: 'u1',
      hostDelegation: delegation,
      topology: wideTopology,
    });
    expect(decision.can.update).toBe(true);
    expect(decision.actions.update.grantedBy).not.toContainEqual({ type: 'host', hostType: 'task' });
  });

  it('fail-closed: no hostRow resolved → delegation contributes nothing', () => {
    const { can } = getAllDecisions(policies, [projectMember], hostedAttachment(undefined), {
      userId: 'u1',
      hostDelegation: delegation,
      topology: wideTopology,
    });
    expect(can.read).toBe(false);
  });

  it('unions with own grants instead of replacing them', () => {
    const { accessPolicies: withOwnRead } = configureWidePermissions(({ subject, contexts }) => {
      if (subject.name === 'attachment' || subject.name === 'task') {
        contexts.project.guest({ read: subject.name === 'attachment' ? 1 : 0 });
        contexts.project.member({ read: 1 });
        contexts.project.admin({ read: 1 });
        contexts.organization.admin({ read: 1 });
        contexts.organization.member({});
      }
    });
    // Guest has own read on attachments but no task read: own grant must survive delegation
    const { can } = getAllDecisions(withOwnRead, [projectGuest], hostedAttachment(taskRow), {
      userId: 'u1',
      hostDelegation: delegation,
      topology: wideTopology,
    });
    expect(can.read).toBe(true);
  });
});

describe('delegateToHost declaration', () => {
  it('collects delegated actions in the config result', () => {
    const { hostDelegation } = configureWidePermissions(({ subject, delegateToHost }) => {
      if (subject.name === 'attachment') delegateToHost(['read']);
    });
    expect(hostDelegation).toEqual({ attachment: ['read'] });
  });

  it('throws for subjects without a hierarchy host', () => {
    expect(() =>
      configureWidePermissions(({ subject, delegateToHost }) => {
        if (subject.name === 'task') delegateToHost(['read']);
      }),
    ).toThrow('requires a host declared in the hierarchy');
  });

  it('throws on empty actions and double declaration', () => {
    expect(() =>
      configureWidePermissions(({ subject, delegateToHost }) => {
        if (subject.name === 'attachment') delegateToHost([]);
      }),
    ).toThrow('at least one action');

    expect(() =>
      configureWidePermissions(({ subject, delegateToHost }) => {
        if (subject.name === 'attachment') {
          delegateToHost(['read']);
          delegateToHost(['update']);
        }
      }),
    ).toThrow('called twice');
  });
});
