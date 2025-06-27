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
    description: `Endpoints for managing *memberships*, which represent one-to-one relationships between a \`user\` and a contextual \`entity\` (e.g., an \`organization\`).  
      Each membership includes role information and status flags such as \`archived\` or \`muted\`.  
      Memberships can also reference parent entities, enabling hierarchical context.`,
  },
  {
    name: 'organizations',
    description: `Endpoints for managing \`organizations\`, which are core contextual entities.  
      Organizations are the highest ancestor in the parent hierarchy.  
      They define access boundaries and are often the minimal primary scope for permission and resource management.`,
  },
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
