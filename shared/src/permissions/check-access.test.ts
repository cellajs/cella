import { describe, expect, it } from 'vitest';
import { type Access, checkAccess, checkAccessBatch, checkAccessFanout } from './check-access.ts';
import type { AccessMembership, SubjectForPermission } from './engine/types.ts';
import type { EntityScope } from './scopes.ts';

/**
 * The credential mask over the template's own policy: an organization admin may do everything with attachments, so
 * every denial below comes from `scopes` alone.
 */
const membership: AccessMembership = {
  channelType: 'organization',
  channelId: 'org1',
  organizationId: 'org1',
  role: 'admin',
  userId: 'u1',
} as AccessMembership;

const subject = (id = 'a1'): SubjectForPermission =>
  ({
    entityType: 'attachment',
    id,
    channelIds: { organization: 'org1' },
    row: { createdBy: 'u1', publicAt: null },
  }) as never;

const admin = (scopes: readonly EntityScope[] | null): Access => ({
  userId: 'u1',
  memberships: [membership],
  scopes,
});

describe('checkAccess with a scoped credential', () => {
  it('an unscoped access (scopes null, what a session sets) keeps the grants', () => {
    expect(checkAccess(admin(null), 'update', subject()).allowed).toBe(true);
    expect(checkAccess({ userId: 'u1', memberships: [membership], scopes: null }, 'delete', subject()).allowed).toBe(
      true,
    );
  });

  it('a read scope reads and never writes', () => {
    expect(checkAccess(admin(['attachment:read']), 'read', subject()).allowed).toBe(true);
    expect(checkAccess(admin(['attachment:read']), 'update', subject()).allowed).toBe(false);
  });

  it('a write scope covers reads', () => {
    expect(checkAccess(admin(['attachment:write']), 'read', subject()).allowed).toBe(true);
  });

  it('an empty or foreign mask fails closed even for an admin', () => {
    expect(checkAccess(admin([]), 'read', subject()).allowed).toBe(false);
    expect(checkAccess(admin(['organization:write']), 'read', subject()).allowed).toBe(false);
  });

  it('the membership is still reported when the mask denies, so callers can tell the two apart', () => {
    const result = checkAccess(admin(['attachment:read']), 'update', subject());
    expect(result.allowed).toBe(false);
    expect(result.membership).not.toBeNull();
  });
});

describe('the mask applies per row in batch and fan-out', () => {
  it('batch: every row of the type is masked the same way', () => {
    const { results } = checkAccessBatch(admin(['attachment:read']), 'update', [subject('a1'), subject('a2')]);
    expect([...results.values()].map((result) => result.allowed)).toEqual([false, false]);
    const reads = checkAccessBatch(admin(['attachment:read']), 'read', [subject('a1'), subject('a2')]);
    expect([...reads.results.values()].map((result) => result.allowed)).toEqual([true, true]);
  });

  it('fan-out: each access carries its own mask', () => {
    const results = checkAccessFanout(
      [admin(null), admin(['attachment:read']), { anonymous: true }],
      'update',
      subject(),
    );
    expect(results.map((result) => result.allowed)).toEqual([true, false, false]);
  });
});
