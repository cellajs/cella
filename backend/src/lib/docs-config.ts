export const apiModulesList = [
  {
    name: 'me',
    description: `Endpoints related to the *current user*, meaning the user associated with the active session making the request.
      These routes are distinct from general \`users\` endpoints: while \`users\` may operate on any user in the system, \`me\` endpoints are scoped exclusively to the *current user* and follow a different authorization flow.`,
  },
  {
    name: 'users',
    description: `Endpoints for managing *users* at the system level.
      Unlike contextual entities (such as \`organizations\`), a \`user\` is a "global" entity and not scoped to a specific context.
      These endpoints are intended for administrative operations on any user in the system.`,
  },
  {
    name: 'memberships',
    description:
      'Memberships represent one-to-one relations between a `user` and a contextual `entity`, such as an `organization`. It contains a role and archived, muted status. It also contains parent entities.',
  },
  { name: 'organizations', description: 'Organizations - `organization` - are a core `entity`.' },
  { name: 'requests', description: 'Receive contact form, newsletter and waitlist requests.' },
  { name: 'entities', description: 'Endpoints that span across entities.' },
  { name: 'system', description: 'Endpoints that are system-wide or system (admin) related.' },
  {
    name: 'auth',
    description: 'Multiple authentication methods are included: email/password combination, OAuth and passkey support.',
  },
  { name: 'attachments', description: 'Be able to leverage different attachment types within an entity.' },
  { name: 'metrics', description: 'Observability endpoints.' },
];
