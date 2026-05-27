import { registerTag } from '#/core/tag-registry';

registerTag({
  tag: 'requests',
  kind: 'module',
  parent: 'cella',
  description: `Endpoints for handling incoming *requests* such as contact form submissions, newsletter signups,
    and waitlist entries.`,
});
