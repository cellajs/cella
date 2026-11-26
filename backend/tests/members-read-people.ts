import { type OrganizationRole, policyMatrix } from 'shared';
import { configurePolicyMatrix } from 'shared/testing/policies';
import { afterAll, beforeAll } from 'vitest';
import { memberRole } from './fixtures';

/**
 * Declares that the file's organization members at `role`, the plain member's (`memberRole`) unless given, read the
 * organization's people: the file runs with that grant patched into the policy.
 */
export const assumeMembersReadPeople = (role: OrganizationRole = memberRole) => {
  let configured: typeof policyMatrix.user;
  beforeAll(() => {
    configured = policyMatrix.user;
    const others = (configured ?? []).filter((entry) => !(entry.channelType === 'organization' && entry.role === role));
    const reads = configurePolicyMatrix(['user'], ({ channels }) => channels.organization[role]({ read: 1 })).user ?? [];
    policyMatrix.user = [...others, ...reads];
  });
  afterAll(() => {
    policyMatrix.user = configured;
  });
};
