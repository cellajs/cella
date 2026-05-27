import { registerTag } from '#/core/tag-registry';

registerTag({
  tag: 'system',
  kind: 'module',
  parent: 'cella',
  description: `*System level* endpoints for administrative actions and platform wide functionality. These endpoints
    support operations such as user invitations, file uploads, and webhook handling.`,
});
