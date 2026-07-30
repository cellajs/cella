import type { MembershipBase } from 'sdk';
import { describe, expect, it } from 'vitest';
import { heldContextRoles } from '~/modules/entities/context-roles';
import type { EnrichedChannel } from '~/modules/entities/types';

// Test mocks: only the fields heldContextRoles reads
const membership = (channelId: string, role: string) =>
  ({ channelType: 'organization', channelId, role }) as MembershipBase;
const entity = { id: 'org1', entityType: 'organization' } as EnrichedChannel;

describe('heldContextRoles', () => {
  it('emits a pair for a membership on the entity itself', () => {
    expect(heldContextRoles(entity, [membership('org1', 'admin')])).toEqual(['organization.admin']);
  });

  it('ignores memberships on unrelated channels and deduplicates pairs', () => {
    const pairs = heldContextRoles(entity, [
      membership('other-org', 'admin'),
      membership('org1', 'member'),
      membership('org1', 'member'),
    ]);
    expect(pairs).toEqual(['organization.member']);
  });

  it('returns no pairs for an actor with no memberships', () => {
    expect(heldContextRoles(entity, [])).toEqual([]);
  });

  it('entity-less form unions every held pair, unscoped by any ancestor chain', () => {
    const pairs = heldContextRoles([
      membership('org1', 'admin'),
      membership('other-org', 'member'),
      membership('org1', 'admin'),
    ]);
    expect(pairs).toEqual(['organization.admin', 'organization.member']);
  });
});
