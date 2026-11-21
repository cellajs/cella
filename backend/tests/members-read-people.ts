import { policyMatrix } from 'shared';
import { configurePolicyMatrix } from 'shared/testing/policies';
import { afterAll, beforeAll } from 'vitest';
import { memberRole } from './fixtures';

/** Declares that the file's plain member (`memberRole`) reads the organization's people: the file runs with that grant patched into the policy. */
export const assumeMembersReadPeople = () => {
  let configured: typeof policyMatrix.user;
  beforeAll(() => {
    configured = policyMatrix.user;
    const others = (configured ?? []).filter((entry) => !(entry.channelType === 'organization' && entry.role === memberRole));
    const reads = configurePolicyMatrix(['user'], ({ channels }) => channels.organization[memberRole]({ read: 1 })).user ?? [];
    policyMatrix.user = [...others, ...reads];
  });
  afterAll(() => {
    policyMatrix.user = configured;
  });
};
