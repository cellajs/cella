import { describe, expect, it } from 'vitest';
import { appConfig } from '../config-builder/app-config';
import { configurePermissions } from './access-policies';
import { getAllDecisions } from './permission-manager/check';
import type { PermissionMembership, SubjectForPermission } from './permission-manager/types';
import type { RowRestrictions } from './row-restrictions';

/**
 * Row restriction semantics at the engine level, on the template hierarchy (a single
 * `organization` context, roles admin/member). Restrictions narrow membership grants
 * per row; row-condition grants ('own'), public grants and `create` are never narrowed;
 * fail-closed without row data; admin exemption is explicit.
 *
 * Multi-level depth ordering ("a grant qualifies only from a context at least as
 * specific as the row's depth") needs a deeper context chain than the template ships —
 * forks with nested contexts (e.g. organization > project) should extend these tests.
 */

// Synthetic policies: admins and members can read/create attachments; members can also update.
const { accessPolicies: policies } = configurePermissions(appConfig.entityTypes, ({ subject, contexts }) => {
  if (subject.name !== 'attachment') return;
  contexts.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
  contexts.organization.member({ create: 1, read: 1, update: 1 });
});

const restrictions: RowRestrictions = {
  attachment: { depthColumn: 'visibilityDepth', rolesColumn: 'audienceRoles', exemptRoles: ['admin'] },
};

const membership = (contextId: string, role: string): PermissionMembership =>
  ({ contextType: 'organization', contextId, role }) as PermissionMembership;

const orgMember = membership('org1', 'member');
const orgAdmin = membership('org1', 'admin');

const attachment = (row: Record<string, unknown> | undefined): SubjectForPermission => ({
  entityType: 'attachment',
  id: 'a1',
  contextIds: { organization: 'org1' },
  ...(row !== undefined && { row }),
});

const readableBy = (m: PermissionMembership, row: Record<string, unknown> | undefined, userId = 'u1') =>
  getAllDecisions(policies, [m], attachment(row), { userId, restrictions }).can.read;

describe('visibilityDepth', () => {
  it('null depth: unrestricted — every read grant qualifies', () => {
    expect(readableBy(orgMember, { visibilityDepth: null })).toBe(true);
  });

  it("depth 'organization': grants from the organization level qualify", () => {
    expect(readableBy(orgMember, { visibilityDepth: 'organization' })).toBe(true);
  });

  it('unknown depth value never qualifies (fail closed)', () => {
    expect(readableBy(orgMember, { visibilityDepth: 'project' })).toBe(false);
    expect(readableBy(orgMember, { visibilityDepth: 'nonsense' })).toBe(false);
  });
});

describe('audienceRoles', () => {
  it('null or empty audience: unrestricted', () => {
    expect(readableBy(orgMember, { audienceRoles: null })).toBe(true);
    expect(readableBy(orgMember, { audienceRoles: [] })).toBe(true);
  });

  it('grant role must be in the audience set', () => {
    expect(readableBy(orgMember, { audienceRoles: ['member'] })).toBe(true);
    expect(readableBy(orgMember, { audienceRoles: ['nobody'] })).toBe(false);
  });

  it('combines with depth: both must qualify', () => {
    expect(readableBy(orgMember, { visibilityDepth: 'organization', audienceRoles: ['member'] })).toBe(true);
    expect(readableBy(orgMember, { visibilityDepth: 'organization', audienceRoles: ['nobody'] })).toBe(false); // role fails
    expect(readableBy(orgMember, { visibilityDepth: 'nonsense', audienceRoles: ['member'] })).toBe(false); // depth fails
  });
});

describe('exemption and bypass rules', () => {
  it('exempt roles bypass the restriction entirely', () => {
    const row = { visibilityDepth: 'nonsense', audienceRoles: ['nobody'] };
    expect(readableBy(orgAdmin, row)).toBe(true);
  });

  it("row-condition grants ('own') are never narrowed — creator sees own restricted row", () => {
    const { accessPolicies: ownPolicies } = configurePermissions(appConfig.entityTypes, ({ subject, contexts }) => {
      if (subject.name !== 'attachment') return;
      contexts.organization.member({ read: 'own' });
    });
    const row = { audienceRoles: ['nobody'] };
    const subject: SubjectForPermission = { ...attachment(row), createdBy: 'u1' };
    const { can } = getAllDecisions(ownPolicies, [orgMember], subject, { userId: 'u1', restrictions });
    expect(can.read).toBe(true);
  });

  it('public read grants are never narrowed', () => {
    const row = { audienceRoles: ['nobody'], publicAt: '2026-01-01' };
    const { can } = getAllDecisions({}, [], attachment(row), {
      restrictions,
      publicGrants: { attachment: 'publicSelf' },
    });
    expect(can.read).toBe(true);
  });

  it('create is never restricted; other actions are', () => {
    const row = { audienceRoles: ['nobody'] };
    const { can } = getAllDecisions(policies, [orgMember], attachment(row), { userId: 'u1', restrictions });
    expect(can.create).toBe(true);
    expect(can.read).toBe(false);
    expect(can.update).toBe(false);
  });

  it('system admin bypasses restrictions like everything else', () => {
    const row = { audienceRoles: ['nobody'] };
    const { can } = getAllDecisions(policies, [], attachment(row), { isSystemAdmin: true, restrictions });
    expect(can.read).toBe(true);
  });
});

describe('fail-closed without row data', () => {
  it('restriction declared + no subject row → non-exempt membership grants do not qualify', () => {
    expect(readableBy(orgMember, undefined)).toBe(false);
    expect(readableBy(orgAdmin, undefined)).toBe(true); // exempt role still qualifies
  });

  it('no restriction declared for the entity type → unchanged behavior', () => {
    const { can } = getAllDecisions(policies, [orgMember], attachment(undefined), { userId: 'u1', restrictions: {} });
    expect(can.read).toBe(true);
  });
});
