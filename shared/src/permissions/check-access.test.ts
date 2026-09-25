import { hierarchy } from 'shared';
import { describe, expect, it } from 'vitest';
import type { AccessScope } from './access-scopes.ts';
import { type Access, checkAccess, checkAccessBatch, checkAccessFanout } from './check-access.ts';
import type { AccessMembership, SubjectForPermission } from './engine/types.ts';

// The attachment's ancestor chain from the app's hierarchy, so the fixture holds for any topology.
const channelIds = Object.fromEntries(hierarchy.getOrderedAncestors('attachment').map((type) => [type, `${type}1`]));
const homeType = hierarchy.getOrderedAncestors('attachment')[0];

/**
 * The key or token mask over the app's own policy: an admin of the attachment's home channel may do everything with
 * attachments, so every denial below comes from `scopes` alone.
 */
const membership: AccessMembership = {
  channelType: homeType,
  channelId: channelIds[homeType],
  organizationId: channelIds.organization,
  role: 'admin',
  userId: 'u1',
} as AccessMembership;

const subject = (id = 'a1'): SubjectForPermission =>
  ({
    entityType: 'attachment',
    id,
    channelIds,
    row: { createdBy: 'u1', publicAt: null },
  }) as never;

const admin = (scopes: readonly AccessScope[] | null): Access => ({
  actorId: 'u1',
  memberships: [membership],
  scopes,
});

describe('checkAccess with a scoped key or token', () => {
  it('an unscoped access (scopes null, what a session sets) keeps the grants', () => {
    expect(checkAccess(admin(null), 'update', subject()).allowed).toBe(true);
    expect(checkAccess({ actorId: 'u1', memberships: [membership], scopes: null }, 'delete', subject()).allowed).toBe(
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
