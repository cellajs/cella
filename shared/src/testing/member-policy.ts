import { afterEach, beforeEach } from 'vitest';
import { hierarchy } from '../../config/config.default.ts';
import { policyMatrix } from '../../config/permissions-config.ts';
import { getEntityPolicies, getPolicyPermissions } from '../permissions/policy-matrix.ts';
import type { EntityActionPermissions } from '../permissions/types.ts';

/** A suite calls this at its top to declare the organization member's attachment policy its assertions assume. */
export function assumeMemberAttachmentPolicy(permissions: Partial<EntityActionPermissions>) {
  const memberRole = hierarchy.getLeastPrivilegedRole('organization');
  const policy = getPolicyPermissions(getEntityPolicies('attachment', policyMatrix), 'organization', memberRole);
  let configured: EntityActionPermissions | undefined;
  beforeEach(() => {
    if (!policy) return;
    configured = { ...policy };
    Object.assign(policy, permissions);
  });
  afterEach(() => {
    if (policy && configured) Object.assign(policy, configured);
  });
}
