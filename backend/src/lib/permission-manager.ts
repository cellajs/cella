import {
  type AccessPolicyConfiguration,
  Context as EntityContext,
  HierarchicalEntity,
  type Membership,
  MembershipAdapter,
  PermissionManager,
  type Subject,
  SubjectAdapter,
} from '@cellajs/permission-manager';

import type { MembershipModel } from '#/db/schema/memberships';
import type { ContextEntity } from '#/types/common';
import { getContextUser, getMemberships } from './context';
import { type EntityModel, resolveEntity } from './entity';

/**
 * Define hierarchical structure for contexts with roles, and for products without roles.
 */
new EntityContext('organization', ['admin', 'member']);

/**
 * Initialize the PermissionManager and configure access policies.
 */
const permissionManager = new PermissionManager('permissionManager');

permissionManager.accessPolicies.configureAccessPolicies(({ subject, contexts }: AccessPolicyConfiguration) => {
  // Configure actions based on the subject
  switch (subject.name) {
    case 'organization':
      contexts.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
      contexts.organization.member({ create: 0, read: 1, update: 0, delete: 0 });
      break;
  }
});

/**
 * Adapter for transforming raw membership data into the expected Membership format.
 */
class AdaptedMembershipAdapter extends MembershipAdapter {
  /**
   * Adapt raw membership data to the Membership format.
   * @param memberships - Array of raw membership data.
   * @returns Array of adapted Membership objects.
   */

  // biome-ignore lint/suspicious/noExplicitAny: The format of the membership object may vary.
  adapt(memberships: any[]): Membership[] {
    return memberships.map((m) => ({
      contextName: m.type?.toLowerCase() || '',
      contextKey: m[`${m.type?.toLowerCase() || ''}Id`],
      roleName: m.role,
      ancestors: {
        organization: m.organizationId,
      },
    }));
  }
}

/**
 * Adapter for transforming raw subject data into the expected Subject format.
 */
class AdaptedSubjectAdapter extends SubjectAdapter {
  /**
   * Adapt raw subject data to the Subject format.
   * @param s - Raw subject data.
   * @returns Adapted Subject object.
   */

  // biome-ignore lint/suspicious/noExplicitAny: The format of the subject can vary depending on the subject.
  adapt(s: any): Subject {
    return {
      name: s.entity,
      key: s.id,
      ancestors: {
        organization: s.organizationId,
      },
    };
  }
}

// Instantiate adapters to be used in the system
new AdaptedSubjectAdapter();
new AdaptedMembershipAdapter();

export const getValidEntity = async <T extends ContextEntity>(
  entityType: T,
  action: 'create' | 'read' | 'update' | 'delete',
  idOrSlug: string,
): Promise<{
  entity: EntityModel<T> | null;
  isAllowed: boolean;
  membership: MembershipModel | null;
}> => {
  const entity = (await resolveEntity(entityType, idOrSlug)) || null;

  if (!entity) {
    return {
      entity: null,
      isAllowed: false,
      membership: null,
    };
  }

  const user = getContextUser();
  const memberships = getMemberships();

  const isSystemAdmin = user.role === 'admin';

  // Check if user is allowed to perform an action on entity
  const isAllowed = permissionManager.isPermissionAllowed(memberships, action, entity) || isSystemAdmin;
  if (!isAllowed) return { entity: null, isAllowed: false, membership: null };

  // Find membership for entity
  const membership = memberships.find((m) => entity && [m.organizationId].includes(entity.id) && m.type === entityType) || null;

  return { entity, isAllowed, membership };
};

// Export the configured PermissionManager instance
export default permissionManager;
export { HierarchicalEntity };
