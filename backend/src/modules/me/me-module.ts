import { registerTag } from '#/core/tag-registry';

registerTag({
  tag: 'me',
  kind: 'module',
  parent: 'cella',
  description: `Endpoints related to the *current user*, meaning the user associated with the active session making
    the request. These routes are distinct from general \`users\` endpoints: while \`users\` may operate on
    any user in the system, \`me\` endpoints are scoped exclusively to the *current user* and follow a
    different authorization flow.`,
});
