import { apiReference } from '@scalar/hono-api-reference';
import { config } from 'config';
import type { CustomHono } from '../types/common';

const openAPITags = [
  { name: 'me', description: 'Current user endpoints. They are split from `users` due to a different authorization flow.' },
  { name: 'users', description: '`user` is also an entity, but NOT a contextual entity.' },
  {
    name: 'memberships',
    description:
      'Memberships are one-on-one relations between a user and a contextual entity, such as an organization. It contains a role and archived, muted status',
  },
  { name: 'organizations', description: 'Organizations - `organization` - are obviously a central `entity`.' },
  { name: 'requests', description: 'Receive public requests such as contact form, newsletter and waitlist requests.' },
  { name: 'general', description: 'Endpoints that overlap multiple entities or are meant to support the system in general.' },
  {
    name: 'auth',
    description:
      'Multiple authentication methods are included: email/password combination, OAuth with Github. Other Oauth providers and passkey support are work in progress.',
  },
  {
    name: 'workspaces',
    description:
      'App-specific entity (will be split from template). Workspace functions for end-users to personalize how they interact with their projects and the content in each project. Only the creator has access and no other members are possible.',
  },
  {
    name: 'projects',
    description:
      'App-specific entity (will be split from template). Projects - like organizations - can have multiple members and are the primary entity in relation to the content-related resources: tasks, labels and attachments. Because a project can be in multiple workspaces, a relations table is maintained.',
  },
  {
    name: 'tasks',
    description: 'App-specific. Tasks content-related resource of project. Also contain task related info and can include subtasks.',
  },
  {
    name: 'labels',
    description: 'App-specific. Labels content-related resource of project. That is using inside the tasks.',
  },
];

const docs = (app: CustomHono) => {
  const registry = app.openAPIRegistry;

  registry.registerComponent('securitySchemes', 'cookieAuth', {
    type: 'apiKey',
    in: 'cookie',
    name: `${config.slug}-session-v1`,
    description:
      "Authentication cookie. Copy the cookie from your network tab and paste it here. If you don't have it, you need to sign in or sign up first.",
  });

  app.doc31('/openapi.json', {
    servers: [{ url: config.backendUrl }],
    info: {
      title: `${config.name} API`,
      version: 'v1',
      description: `
      (ATTENTION: PRERELEASE!) This API documentation is split in modules. Each module relates to a module in the backend codebase. Each module should be at least loosely-coupled, but ideally entirely decoupled. The documentation is based upon zod schemas that are converted to openapi specs using hono middleware: zod-openapi.

      API differentiates between three types of resources: 

      1) page-related resources are called an 'entity' (ie organization or user)
      2) a subclass are 'contextual entities' (ie organization, not user)
      3) remaining data objects are simply content-related 'resources'.

      - Content-related resources - called simply 'resources' - dont have an API
        they run through the Electric SQL sync engine
      - SSE stream is not included in this API documentation
      - API design is flat, not nested
      `,
    },
    openapi: '3.1.0',
    tags: openAPITags,
    security: [{ cookieAuth: [] }],
  });

  app.get(
    '/docs',
    apiReference({
      spec: {
        url: 'openapi.json',
      },
    }),
  );
};

export default docs;
