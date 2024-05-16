// Import required modules from '@cellajs/permission-manager'
import { 
  Context,
  PermissionManager, 
  MembershipAdapter, 
  SubjectAdapter,
  HierarchicalEntity,
  type Subject,
  type Membership,
  type AccessPolicyConfiguration 
} from '@cellajs/permission-manager';

/**
 * Define hierarchical structure for contexts with roles.
 */
const organization = new Context('organization', ['ADMIN', 'MEMBER']);
new Context('workspace', ['ADMIN', 'MEMBER'], new Set([organization]));

/**
 * Initialize the PermissionManager and configure access policies.
 */
const permissionManager = new PermissionManager('permissionManager');

permissionManager.accessPolicies.configureAccessPolicies(({ subject, contexts }: AccessPolicyConfiguration) => {
  // Configure actions based on the subject (organization or workspace)
  switch (subject.name) {
    case 'organization':
      contexts.organization.ADMIN({ create: 0, read: 1, update: 1, delete: 1 });
      contexts.organization.MEMBER({ create: 0, read: 1, update: 0, delete: 0 });
      break;
    case 'workspace':
      contexts.organization.ADMIN({ create: 1, read: 1, update: 1, delete: 1 });
      contexts.workspace.ADMIN({ create: 0, read: 1, update: 1, delete: 1 });
      contexts.workspace.MEMBER({ create: 0, read: 1, update: 0, delete: 0 });
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
      }
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
      // TODO: Replace inline type determination with a type declaration in the schema!
      name: !('organizationId' in s) ? 'organization' : 'workspace',
      key: s.id,
      ancestors: { 
        organization: s.organizationId,
      }
    };
  }
}

// Instantiate adapters to be used in the system
new AdaptedSubjectAdapter();
new AdaptedMembershipAdapter();

// Export the configured PermissionManager instance
export default permissionManager;
export { HierarchicalEntity };