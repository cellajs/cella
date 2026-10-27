import { afterEach, beforeEach } from 'vitest';
import { hierarchy } from '../../config/config.default.ts';
import { policyMatrix } from '../../config/permissions-config.ts';
import { getEntityPolicies, getPolicyPermissions } from '../permissions/policy-matrix.ts';
import type { EntityActionPermissions } from '../permissions/types.ts';

/**
 * A suite calls this at its top to declare the member's attachment policy its assertions assume: the organization
 * member's, and the same role's in each channel below the organization that homes attachments, which a member reaches
 * through `joinAttachmentHome` when the organization role is not elevated.
 */
export function assumeMemberAttachmentPolicy(permissions: Partial<EntityActionPermissions>) {
  const memberRole = hierarchy.getLeastPrivilegedRole('organization');
  const policies = getEntityPolicies(policyMatrix, 'attachment');
  const channelTypes = new Set(['organization', ...hierarchy.possibleHomeChannels('attachment')]);
  const assumed = [...channelTypes].flatMap((channelType) => getPolicyPermissions(policies, channelType, memberRole) ?? []);
  let configured: EntityActionPermissions[] = [];
  beforeEach(() => {
    configured = assumed.map((policy) => ({ ...policy }));
    for (const policy of assumed) Object.assign(policy, permissions);
  });
  afterEach(() => {
    assumed.forEach((policy, index) => {
      const original = configured[index];
      if (original) Object.assign(policy, original);
    });
    configured = [];
  });
}
