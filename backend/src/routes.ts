import attachmentsRoutes from '#/modules/attachments';
import authRoutes from '#/modules/auth';
import generalRoutes from '#/modules/general';
import labelsRoutes from '#/modules/labels';
import meRoutes from '#/modules/me';
import membershipsRoutes from '#/modules/memberships';
import organizationsRoutes from '#/modules/organizations';
import projectsRoutes from '#/modules/projects';
import requestsRoutes from '#/modules/requests';
import tasksRoutes from '#/modules/tasks';
import usersRoutes from '#/modules/users';
import workspacesRoutes from '#/modules/workspaces';

// Combine all routes from each module. The core modules are on top, followed by app-specific modules.
const routes = [
  authRoutes,
  meRoutes,
  usersRoutes,
  organizationsRoutes,
  generalRoutes,
  requestsRoutes,
  membershipsRoutes,
  attachmentsRoutes,
  workspacesRoutes,
  projectsRoutes,
  tasksRoutes,
  labelsRoutes,
];

export default routes;
