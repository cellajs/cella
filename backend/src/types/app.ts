import type { User } from 'lucia';
import type { MembershipModel } from '#/db/schema/memberships';
import type { OrganizationModel } from '#/db/schema/organizations';
import type { ProjectModel } from '#/db/schema/projects';
import type { WorkspaceModel } from '#/db/schema/workspaces';

// Middleware env is app-specific
export type Env = {
  Variables: {
    user: User;
    organization: OrganizationModel;
    project: ProjectModel;
    workspace: WorkspaceModel;
    memberships: [MembershipModel];
    allowedIds: Array<string>;
    disallowedIds: Array<string>;
  };
};
