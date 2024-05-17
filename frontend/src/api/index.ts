import type { ErrorType } from 'backend/lib/errors';
import type { AuthRoutes } from 'backend/modules/auth/index';
import type { GeneralRoutes } from 'backend/modules/general/index';
import type { MembershipRoutes } from 'backend/modules/memberships/index';
import type { OrganizationsRoutes } from 'backend/modules/organizations/index';
import type { ProjectsRoutes } from 'backend/modules/projects/index';
import type { PublicRoutes } from 'backend/modules/public/index';
import type { UsersRoutes } from 'backend/modules/users/index';
import type { WorkspacesRoutes } from 'backend/modules/workspaces/index';
import type { PageResourceType } from 'backend/types/common';

import { config } from 'config';
import { hc } from 'hono/client';

// Custom error class to handle API errors
export class ApiError extends Error {
  status: string | number;
  type?: string;
  resourceType?: PageResourceType;
  severity?: string;
  logId?: string;
  path?: string;
  method?: string;
  timestamp?: string;
  usr?: string;
  org?: string;

  constructor(error: ErrorType) {
    super(error.message);
    this.status = error.status;
    this.type = error.type;
    this.resourceType = error.resourceType;
    this.severity = error.severity;
    this.logId = error.logId;
    this.path = error.path;
    this.method = error.method;
    this.timestamp = error.timestamp;
    this.usr = error.usr;
    this.org = error.org;
  }
}

const clientConfig = {
  fetch: (input: RequestInfo | URL, init?: RequestInit) =>
    fetch(input, {
      ...init,
      credentials: 'include',
    }),
};

// Create Hono clients to make requests to the backend
export const authClient = hc<AuthRoutes>(config.backendUrl, clientConfig);
export const usersClient = hc<UsersRoutes>(config.backendUrl, clientConfig);
export const organizationsClient = hc<OrganizationsRoutes>(config.backendUrl, clientConfig);
export const membershipClient = hc<MembershipRoutes>(config.backendUrl, clientConfig);
export const generalClient = hc<GeneralRoutes>(config.backendUrl, clientConfig);
export const publicClient = hc<PublicRoutes>(config.backendUrl, clientConfig);
export const workspaceClient = hc<WorkspacesRoutes>(config.backendUrl, clientConfig);
export const projectClient = hc<ProjectsRoutes>(config.backendUrl, clientConfig);
