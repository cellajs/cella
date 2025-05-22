export const apiModulesList = [
  { name: 'me', description: 'Current user endpoints. Split from `users` due to different authorization flow.' },
  { name: 'users', description: '`user` is also an entity, but NOT a contextual entity.' },
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
