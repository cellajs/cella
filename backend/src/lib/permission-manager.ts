// Import required modules from '@cellajs/permission-manager'
import {
  type AccessPolicyConfiguration,
  Context,
  HierarchicalEntity,
  type Membership,
  MembershipAdapter,
  PermissionManager,
  Product,
  type Subject,
  SubjectAdapter,
} from '@cellajs/permission-manager';

/**
 * Define hierarchical structure for contexts with roles, and for products without roles.
 */
const organization = new Context('organization', ['admin', 'member']);
new Context('workspace', ['admin', 'member'], new Set([organization]));
const project = new Context('project', ['admin', 'member'], new Set([organization]));

new Product('task', new Set([project]));

/**
 * Initialize the PermissionManager and configure access policies.
 */
const permissionManager = new PermissionManager('permissionManager');

permissionManager.accessPolicies.configureAccessPolicies(({ subject, contexts }: AccessPolicyConfiguration) => {
  // Configure actions based on the subject (organization or workspace)
  switch (subject.name) {
    case 'organization':
      contexts.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
      contexts.organization.member({ create: 0, read: 1, update: 0, delete: 0 });
      break;
    case 'workspace':
      contexts.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
      contexts.workspace.admin({ create: 0, read: 1, update: 1, delete: 1 });
      contexts.workspace.member({ create: 0, read: 1, update: 0, delete: 0 });
      break;
    case 'project':
      contexts.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
      contexts.project.admin({ create: 0, read: 1, update: 1, delete: 1 });
      contexts.project.member({ create: 0, read: 1, update: 0, delete: 0 });
      break;
    case 'task':
      contexts.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
      contexts.project.admin({ create: 1, read: 1, update: 1, delete: 1 });
      contexts.project.member({ create: 1, read: 1, update: 1, delete: 1 });
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
        workspace: m.workspaceId,
        project: m.projectId,
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
        workspace: s.workspaceId,
        project: s.projectId,
      },
    };
  }
}

// Instantiate adapters to be used in the system
new AdaptedSubjectAdapter();
new AdaptedMembershipAdapter();

// Export the configured PermissionManager instance
export default permissionManager;
export { HierarchicalEntity };
