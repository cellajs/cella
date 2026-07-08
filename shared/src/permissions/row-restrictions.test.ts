import { describe, expect, it } from 'vitest';
import { getAllDecisions } from './permission-manager/check';
import type { PermissionMembership, SubjectForPermission } from './permission-manager/types';
import {
  configureWidePermissions,
  wideMembership,
  widePublicGrants,
  wideRestrictions,
  wideSubject,
  wideTopology,
} from '../testing/wide-fixture';

/**
 * Row restrictions (`restrict`): narrow membership grants per row via `visibilityDepth` and
 * `audienceRoles`, with exempt roles bypassing the restriction and row-condition/public grants
 * never narrowed. See `row-restrictions.ts` for the full semantics.
 *
 * Runs against the wide fixture's project → organization chain (roles admin/member/guest),
 * which exercises multi-level `visibilityDepth` ordering and cross-level `audienceRoles` sets
 * regardless of how deeply a fork's own config nests contexts.
 */

// Synthetic policies: every role can read tasks unconditionally; project members can
// also update, and everyone with membership can create.
const { accessPolicies: policies } = configureWidePermissions(({ subject, contexts }) => {
  if (subject.name !== 'task') return;
  contexts.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
  contexts.organization.member({ create: 1, read: 1 });
  contexts.project.admin({ create: 1, read: 1, update: 1, delete: 1 });
  contexts.project.member({ create: 1, read: 1, update: 1 });
  contexts.project.guest({ read: 1 });
});

const restrictions = wideRestrictions({
  task: { depthColumn: 'visibilityDepth', rolesColumn: 'audienceRoles', exemptRoles: ['admin'] },
});

const orgMember = wideMembership('organization', 'org1', 'member');
const orgAdmin = wideMembership('organization', 'org1', 'admin');
const projectMember = wideMembership('project', 'p1', 'member');
const projectGuest = wideMembership('project', 'p1', 'guest');

const task = (row: Record<string, unknown> | undefined): SubjectForPermission =>
  wideSubject({
    entityType: 'task',
    id: 't1',
    contextIds: { organization: 'org1', project: 'p1' },
    ...(row !== undefined && { row }),
  });

const readableBy = (m: PermissionMembership, row: Record<string, unknown> | undefined, userId = 'u1') =>
  getAllDecisions(policies, [m], task(row), { userId, restrictions, topology: wideTopology }).can.read;

// Multi-level ordering: wide fixture's chain project > organization, roles admin/member/guest.
describe('visibilityDepth', () => {
  it('null depth: unrestricted — every read grant qualifies', () => {
    expect(readableBy(orgMember, { visibilityDepth: null })).toBe(true);
    expect(readableBy(projectMember, { visibilityDepth: null })).toBe(true);
  });

  it("depth 'project': only grants at least as specific as project qualify", () => {
    expect(readableBy(projectMember, { visibilityDepth: 'project' })).toBe(true);
    expect(readableBy(orgMember, { visibilityDepth: 'project' })).toBe(false);
  });

  it("depth 'organization': grants from both levels qualify (deeper is more specific)", () => {
    expect(readableBy(orgMember, { visibilityDepth: 'organization' })).toBe(true);
    expect(readableBy(projectMember, { visibilityDepth: 'organization' })).toBe(true);
  });

  it('unknown depth value never qualifies (fail closed)', () => {
    expect(readableBy(projectMember, { visibilityDepth: 'workspace' })).toBe(false);
    expect(readableBy(orgMember, { visibilityDepth: 'nonsense' })).toBe(false);
  });
});

describe('audienceRoles', () => {
  it('null or empty audience: unrestricted', () => {
    expect(readableBy(projectGuest, { audienceRoles: null })).toBe(true);
    expect(readableBy(projectGuest, { audienceRoles: [] })).toBe(true);
  });

  it('grant role must be in the audience set, qualified per grant', () => {
    expect(readableBy(projectMember, { audienceRoles: ['member'] })).toBe(true);
    expect(readableBy(projectGuest, { audienceRoles: ['member'] })).toBe(false);
    // Set can span levels: org member and project guest both qualify against one set
    expect(readableBy(orgMember, { audienceRoles: ['member', 'guest'] })).toBe(true);
    expect(readableBy(projectGuest, { audienceRoles: ['member', 'guest'] })).toBe(true);
  });

  it('combines with depth: both must qualify', () => {
    const row = { visibilityDepth: 'project', audienceRoles: ['member'] };
    expect(readableBy(projectMember, row)).toBe(true);
    expect(readableBy(projectGuest, row)).toBe(false); // role fails
    expect(readableBy(orgMember, row)).toBe(false); // depth fails
  });
});

describe('exemption and bypass rules', () => {
  it('exempt roles bypass the restriction entirely', () => {
    const row = { visibilityDepth: 'project', audienceRoles: ['member'] };
    expect(readableBy(orgAdmin, row)).toBe(true);
  });

  it("row-condition grants ('own') are never narrowed — creator sees own restricted row", () => {
    const { accessPolicies: ownPolicies } = configureWidePermissions(({ subject, contexts }) => {
      if (subject.name !== 'task') return;
      contexts.organization.member({ read: 'own' });
    });
    const row = { visibilityDepth: 'project', audienceRoles: ['nobody'] };
    const subject: SubjectForPermission = { ...task(row), createdBy: 'u1' };
    const { can } = getAllDecisions(ownPolicies, [orgMember], subject, {
      userId: 'u1',
      restrictions,
      topology: wideTopology,
    });
    expect(can.read).toBe(true);
  });

  it('public read grants are never narrowed', () => {
    const row = { visibilityDepth: 'project', audienceRoles: ['nobody'], publicAt: '2026-01-01' };
    const { can } = getAllDecisions({}, [], task(row), {
      restrictions,
      publicGrants: widePublicGrants({ task: 'publicSelf' }),
      topology: wideTopology,
    });
    expect(can.read).toBe(true);
  });

  it('create is never restricted; other actions are', () => {
    const row = { visibilityDepth: 'project', audienceRoles: ['guest'] };
    const { can } = getAllDecisions(policies, [projectMember], task(row), {
      userId: 'u1',
      restrictions,
      topology: wideTopology,
    });
    expect(can.create).toBe(true);
    expect(can.read).toBe(false);
    expect(can.update).toBe(false);
  });

  it('system admin bypasses restrictions like everything else', () => {
    const row = { visibilityDepth: 'project', audienceRoles: ['nobody'] };
    const { can } = getAllDecisions(policies, [], task(row), {
      isSystemAdmin: true,
      restrictions,
      topology: wideTopology,
    });
    expect(can.read).toBe(true);
  });
});

describe('fail-closed without row data', () => {
  it('restriction declared + no subject row → non-exempt membership grants do not qualify', () => {
    expect(readableBy(projectMember, undefined)).toBe(false);
    expect(readableBy(orgAdmin, undefined)).toBe(true); // exempt role still qualifies
  });

  it('no restriction declared for the entity type → unchanged behavior', () => {
    const { can } = getAllDecisions(policies, [projectMember], task(undefined), {
      userId: 'u1',
      restrictions: {},
      topology: wideTopology,
    });
    expect(can.read).toBe(true);
  });
});
