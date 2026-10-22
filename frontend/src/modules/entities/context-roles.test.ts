import type { MembershipBase } from 'sdk';
import { describe, expect, it } from 'vitest';
import { heldContextRoles } from '~/modules/entities/context-roles';
import type { EnrichedChannel } from '~/modules/entities/types';

const membership = (channelId: string, role: string) => ({ channelType: 'organization', channelId, role }) as MembershipBase;
const entity = { id: 'org1', entityType: 'organization' } as EnrichedChannel;

describe('heldContextRoles', () => {
  it("holds the roles of memberships on the entity's own channel, once each, and none from other channels", () => {
    const memberships = [membership('other-org', 'admin'), membership('org1', 'member'), membership('org1', 'member')];
    expect(heldContextRoles(entity, memberships)).toEqual(['organization.member']);
  });
});
