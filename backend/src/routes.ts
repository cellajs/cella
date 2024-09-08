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

export type Route = {
  path: string;
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  routes: any;
};

// Combine all routes from each module. The core modules are on top, followed by app-specific modules.
const routes: Route[] = [
  {
    path: '/auth',
    routes: authRoutes,
  },
  {
    path: '/me',
    routes: meRoutes,
  },
  {
    path: '/users',
    routes: usersRoutes,
  },
  {
    path: '/organizations',
    routes: organizationsRoutes,
  },
  {
    path: '/',
    routes: generalRoutes,
  },
  {
    path: '/requests',
    routes: requestsRoutes,
  },
  {
    path: '/memberships',
    routes: membershipsRoutes,
  },
  {
    path: '/attachments',
    routes: attachmentsRoutes,
  },
  // App-specific modules
  {
    path: '/workspaces',
    routes: workspacesRoutes,
  },
  {
    path: '/projects',
    routes: projectsRoutes,
  },
  {
    path: '/tasks',
    routes: tasksRoutes,
  },
  {
    path: '/labels',
    routes: labelsRoutes,
  },
];

export default routes;

// Description of the app-specific modules for the API docs, generated by hono/zod-openapi and scalar/hono-api-reference
export const appModulesList = [
  {
    name: 'workspaces',
    description:
      'App-specific context entity. Workspace functions for end-users to personalize how they interact with their projects and the content in each project. Only the creator has access and no other members are possible.',
  },
  {
    name: 'projects',
    description:
      'App-specific context entity. Projects - like organizations - can have multiple members and are the primary entity in relation to the content-related resources: tasks, labels and attachments. Because a project can be in multiple workspaces, a relations table is maintained.',
  },
  {
    name: 'tasks',
    description: 'App-specific product entity. Tasks are added to a project and can also contain subtasks.',
  },
  {
    name: 'labels',
    description: 'App-specific product entity. Labels are given to tasks and are listed as part of on or more projects.',
  },
];
